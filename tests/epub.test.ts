import { describe, expect, it } from "vitest";
import { buildEpub } from "@/offscreen/epub";
import { computeProgress, DEFAULT_JOB_SETTINGS } from "@/core/model/types";
import type { ChapterState, JobRecord } from "@/core/model/types";
import type { StoredChapterContent } from "@/core/storage/db";

function job(chapters: ChapterState[]): JobRecord {
  return {
    id: "job-1",
    tabId: 7,
    novel: {
      id: "ranobes:1207185",
      sourceId: "ranobes",
      url: "https://x",
      title: "Novel Title",
      language: "en",
    },
    metadata: {
      title: "My Book",
      author: "Author Name",
      language: "en",
      description: "A tale of <testing>.",
    },
    chapters,
    settings: DEFAULT_JOB_SETTINGS,
    phase: "assembling",
    progress: computeProgress(chapters),
    createdAt: 0,
    updatedAt: 1700000000000,
  };
}

const chState = (index: number, status: ChapterState["status"]): ChapterState => ({
  ref: { index, title: `Chapter ${index}`, url: `https://x/${index}.html` },
  status,
  attempts: status === "failed" ? DEFAULT_JOB_SETTINGS.maxAttempts : 0,
  error: status === "failed" ? "HTTP 404" : undefined,
});

const content = (index: number, title: string, bodyHtml: string): StoredChapterContent => ({
  jobId: "job-1",
  index,
  title,
  bodyHtml,
});

describe("buildEpub", () => {
  it("stores mimetype uncompressed as application/epub+zip", async () => {
    const zip = buildEpub(job([chState(0, "done")]), [content(0, "Ch 0", "<p>Hi</p>")]);
    const file = zip.file("mimetype");
    expect(file).not.toBeNull();
    expect(await file!.async("string")).toBe("application/epub+zip");
  });

  it("points container.xml at the OPF package document", async () => {
    const zip = buildEpub(job([chState(0, "done")]), [content(0, "Ch 0", "<p>Hi</p>")]);
    const xml = await zip.file("META-INF/container.xml")!.async("string");
    expect(xml).toContain('full-path="OEBPS/content.opf"');
  });

  it("includes done chapters in the spine, in job.chapters array order", async () => {
    const chapters = [chState(5, "done"), chState(2, "done")];
    const chapterContent = [
      content(5, "Chapter Five", "<p>Five</p>"),
      content(2, "Chapter Two", "<p>Two</p>"),
    ];
    const zip = buildEpub(job(chapters), chapterContent);
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    const idx5 = opf.indexOf('idref="chap-5"');
    const idx2 = opf.indexOf('idref="chap-2"');
    expect(idx5).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx5);
    expect(await zip.file("OEBPS/chapters/chapter-5.xhtml")!.async("string")).toContain("<p>Five</p>");
  });

  it("excludes skipped chapters entirely", async () => {
    const chapters = [chState(0, "done"), chState(1, "skipped")];
    const chapterContent = [content(0, "Ch 0", "<p>Zero</p>")];
    const zip = buildEpub(job(chapters), chapterContent);
    expect(zip.file("OEBPS/chapters/chapter-1.xhtml")).toBeNull();
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).not.toContain("chap-1");
  });

  it("renders a placeholder page for a permanently failed chapter", async () => {
    const zip = buildEpub(job([chState(0, "failed")]), []);
    const xhtml = await zip.file("OEBPS/chapters/chapter-0.xhtml")!.async("string");
    expect(xhtml).toContain("could not be downloaded");
    expect(xhtml).toContain("HTTP 404");
  });

  it("escapes XML-sensitive characters in metadata", async () => {
    const zip = buildEpub(job([chState(0, "done")]), [content(0, "Ch 0", "<p>Hi</p>")]);
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).toContain("&lt;testing&gt;");
  });

  it("embeds the cover image when provided", async () => {
    const cover = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };
    const zip = buildEpub(job([chState(0, "done")]), [content(0, "Ch 0", "<p>Hi</p>")], cover);
    expect(zip.file("OEBPS/images/cover.png")).not.toBeNull();
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).toContain('properties="cover-image"');
  });
});
