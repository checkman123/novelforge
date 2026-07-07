import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ranobesAdapter } from "@/core/adapters/ranobes";

/**
 * Fixture-based regression test against a real, saved Ranobes novel page.
 * If Ranobes changes its markup, this test fails loudly instead of the
 * adapter silently returning wrong or missing data.
 */
const html = readFileSync("tests/fixtures/ranobes/novel-page.html", "utf-8");
const url = new URL(
  "https://ranobes.top/novels/1207185-the-sword-illuminates-the-great-wilderness.html",
);

function loadDoc(): Document {
  return new JSDOM(html, { url: url.href }).window.document;
}

describe("ranobesAdapter (novel landing page fixture)", () => {
  it("detects the page as a novel page", () => {
    const detection = ranobesAdapter.detectPage(loadDoc(), url);
    expect(detection.pageKind).toBe("novel");
    expect(detection.siteId).toBe("ranobes");
  });

  it("extracts title, author, cover and description", () => {
    const info = ranobesAdapter.getNovelInfo(loadDoc(), url);
    expect(info).not.toBeNull();
    expect(info?.id).toBe("ranobes:1207185");
    expect(info?.title).toBe("Radiant Blade of the Wilderness");
    expect(info?.author).toBe("Cuttlefish That Loves Diving");
    expect(info?.coverUrl).toBe(
      "https://ranobes.top/uploads/posts/2026-07/1783004480_radiant-blade-of-the-wilderness.webp",
    );
    expect(info?.description).toContain("Zhulong, the Torch Dragon");
    expect(info?.description).not.toMatch(/Collapse\s*$/);
  });

  it("recognizes chapter and TOC URLs from this novel", () => {
    const chapterUrl = new URL(
      "https://ranobes.top/the-sword-illuminates-the-great-wilderness-1207185/3219072.html",
    );
    const tocUrl = new URL("https://ranobes.top/chapters/1207185/");
    expect(ranobesAdapter.detectPage(loadDoc(), chapterUrl).pageKind).toBe("chapter");
    expect(ranobesAdapter.detectPage(loadDoc(), tocUrl).pageKind).toBe("toc");
  });
});
