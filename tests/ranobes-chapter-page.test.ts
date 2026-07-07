import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ranobesAdapter } from "@/core/adapters/ranobes";
import type { ChapterRef } from "@/core/model/types";

/**
 * Fixture-based regression test against a real, saved Ranobes chapter page.
 * If Ranobes changes its markup, this test fails loudly instead of the
 * adapter silently returning wrong or missing data.
 */
const html = readFileSync("tests/fixtures/ranobes/chapter-page.html", "utf-8");

const ref: ChapterRef = {
  index: 73,
  title: "placeholder title from TOC",
  url: "https://ranobes.top/the-sword-illuminates-the-great-wilderness-1207185/3219072.html",
};

describe("ranobesAdapter (chapter page fixture)", () => {
  it("extracts the chapter title from the page, not the TOC placeholder", () => {
    const chapter = ranobesAdapter.extractChapter(html, ref);
    expect(chapter.title).toBe("Chapter 74: Frostshade");
  });

  it("keeps paragraph text and italics from the story body", () => {
    const chapter = ranobesAdapter.extractChapter(html, ref);
    expect(chapter.bodyHtml).toContain(
      "<p>Hall of Myriad Stars, Purple Forbidden Pavilion.</p>",
    );
    expect(chapter.bodyHtml).toContain(
      "<i>What’s this? This is the hope of the entire sect!</i>",
    );
    expect(chapter.bodyHtml).toContain("Author’s Note: The values of feet");
  });

  it("strips injected ad scripts and ad container divs from mid-paragraph", () => {
    const chapter = ranobesAdapter.extractChapter(html, ref);
    expect(chapter.bodyHtml).not.toContain("<script");
    expect(chapter.bodyHtml).not.toContain("bg-ssp");
    expect(chapter.bodyHtml).not.toContain("pubadx");
    // The ad block sat between two sentences; they must still read as one paragraph.
    expect(chapter.bodyHtml).toContain(
      "aperture forging, meridian condensation, and viscera installation Chapters of the Celestial Stars Scripture and the Candlelit Nocturne Sutra for reference with the condition that the precious scriptures could not be taken away, and that any later reflection could rely only on his own memory. It was never to be committed to writing.",
    );
  });

  it("emits only allowlisted tags with no attributes", () => {
    const chapter = ranobesAdapter.extractChapter(html, ref);
    expect(chapter.bodyHtml).not.toMatch(/<(?!\/?(p|i)\b)[a-z][^>]*>/i);
    expect(chapter.bodyHtml).not.toMatch(/<(p|i)\s+[^>]*>/i);
  });
});
