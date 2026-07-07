import { createRouter } from "@/core/messaging/bus";
import { getJob, listChapterContent } from "@/core/storage/jobs";
import { buildEpub, type CoverImage } from "./epub";

/**
 * Offscreen document: the only context with full DOM (Blob URLs, image
 * fetch/decode) that isn't subject to service worker eviction. Assembles the
 * EPUB and triggers the browser download itself, so no binary payload needs
 * to travel back through message-passing.
 */

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

function guessMimeFromUrl(url: string): string {
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  if (/\.gif(\?|$)/i.test(url)) return "image/gif";
  return "image/jpeg";
}

async function fetchCover(url: string | undefined): Promise<CoverImage | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || guessMimeFromUrl(url);
    return { bytes, mimeType };
  } catch (err) {
    console.warn("[novelforge] cover fetch failed, building EPUB without a cover", err);
    return undefined;
  }
}

createRouter({
  "epub/assemble": async ({ jobId }) => {
    try {
      const job = await getJob(jobId);
      if (!job) return { ok: false, error: `Job ${jobId} not found` };

      const chapterContent = await listChapterContent(jobId);
      const cover = await fetchCover(job.metadata.coverUrl);
      const zip = buildEpub(job, chapterContent, cover);
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
      const url = URL.createObjectURL(blob);

      const filename = `${job.metadata.title.replace(ILLEGAL_FILENAME_CHARS, "_").trim()}.epub`;
      await chrome.downloads.download({ url, filename, saveAs: false });
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

console.info("[novelforge] offscreen document ready");
