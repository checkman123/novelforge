import type { ChapterRef, NovelInfo } from "@/core/model/types";
import {
  AdapterFetchError,
  type AdapterIo,
  type ExtractedChapter,
  type PageDetection,
  type PageKind,
  type SiteAdapter,
} from "@/core/adapters/types";

/**
 * Ranobes adapter.
 *
 * Page detection, novel metadata, and chapter extraction are verified against
 * saved HTML fixtures (see tests/fixtures/ranobes/). `getChapterList` is the
 * remaining piece — it needs a saved table-of-contents page fixture first.
 */

const HOSTS = ["ranobes.top", "ranobes.net", "ranobes.com"];

// Confirmed against a live novel landing page (2026-07):
//   novel:   /novels/1207185-the-sword-illuminates-the-great-wilderness.html
//   chapter: /the-sword-illuminates-the-great-wilderness-1207185/3219072.html
//   toc:     /chapters/1207185/
const NOVEL_PATH_RE = /^\/novels\/\d+-[a-z0-9-]+\.html$/i;
const CHAPTER_PATH_RE = /^\/[a-z0-9-]+-\d+\/\d+\.html$/i;
const TOC_PATH_RE = /^\/chapters\/\d+\/?/i;

function pageKindOf(url: URL): PageKind {
  if (CHAPTER_PATH_RE.test(url.pathname)) return "chapter";
  if (NOVEL_PATH_RE.test(url.pathname)) return "novel";
  if (TOC_PATH_RE.test(url.pathname)) return "toc";
  return "unknown";
}

/** Extracts the numeric novel id from a novel or TOC URL, if present. */
function novelIdFrom(url: URL): string | null {
  const novelMatch = /^\/novels\/(\d+)-/i.exec(url.pathname);
  if (novelMatch) return novelMatch[1] ?? null;
  const tocMatch = /^\/chapters\/(\d+)\/?/i.exec(url.pathname);
  return tocMatch?.[1] ?? null;
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? "";
}

// Verified 2026-07 against a live chapter page (see tests/fixtures/ranobes/chapter-page.html).
// Story text only ever uses <p> and <i>; ad networks inject <script> tags and
// #bg-ssp-*/.free-support-top <div>s mid-paragraph, which must be dropped
// without breaking the surrounding sentence.
const ALLOWED_TAGS = new Set(["P", "I"]);

/** Recursively rebuilds `node`'s children keeping only allowlisted tags (with
 *  no attributes) and text, dropping everything else (and its subtree). */
function sanitizeInto(source: Node, target: Node, targetDoc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === 3) {
      target.appendChild(targetDoc.createTextNode(child.textContent ?? ""));
    } else if (child.nodeType === 1 && ALLOWED_TAGS.has((child as Element).tagName)) {
      const clean = targetDoc.createElement((child as Element).tagName);
      sanitizeInto(child, clean, targetDoc);
      target.appendChild(clean);
    }
    // Other element types (script, ad divs, etc.) are dropped entirely.
  }
}

export const ranobesAdapter: SiteAdapter = {
  id: "ranobes",
  label: "Ranobes",

  matches(url: URL): boolean {
    const host = url.hostname.replace(/^www\./, "");
    return HOSTS.includes(host);
  },

  detectPage(doc: Document, url: URL): PageDetection {
    const pageKind = pageKindOf(url);
    const novel = pageKind === "novel" ? this.getNovelInfo(doc, url) : null;
    return { siteId: this.id, siteLabel: this.label, pageKind, novel };
  },

  getNovelInfo(doc: Document, url: URL): NovelInfo | null {
    // Verified 2026-07 against a live novel landing page (see adapters/ranobes/README.md).
    // og:title is already the clean English title. h1.title mixes languages,
    // e.g. "English Title<span hidden> • </span><span class=subtitle>中文</span>",
    // so as a fallback we take only its first text node.
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
    const h1FirstTextNode = Array.from(doc.querySelector("h1.title")?.childNodes ?? []).find(
      (n) => n.nodeType === 3 && n.textContent?.trim(),
    )?.textContent?.trim();
    const title = ogTitle || h1FirstTextNode || doc.title.split("•")[0]?.trim();
    if (!title) return null;

    // Cover: prefer the full-size image behind the highslide anchor,
    // fall back to the <figure class="cover"> background image.
    const anchor = doc.querySelector<HTMLAnchorElement>(".poster a.highslide");
    let coverUrl = anchor?.href;
    if (!coverUrl) {
      const fig = doc.querySelector<HTMLElement>(".poster figure.cover");
      const m = fig?.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
      if (m?.[1]) coverUrl = new URL(m[1], url).href;
    }

    // Author is listed as: <li>Authors: <span class="tag_list"><a href=".../tags/authors/Name/">Name</a></span></li>
    const authorLinks = Array.from(
      doc.querySelectorAll<HTMLAnchorElement>('.tag_list a[href*="/tags/authors/"]'),
    ).map((a) => text(a));
    const author = authorLinks.length > 0 ? authorLinks.join(", ") : undefined;

    // Description: strip the italic epigraph wrapper, keep the rest as plain text.
    const descEl = doc.querySelector<HTMLElement>(".moreless__full");
    const description = descEl ? text(descEl).replace(/\s*Collapse\s*$/, "") : undefined;

    const novelId = novelIdFrom(url);

    return {
      id: `ranobes:${novelId ?? url.pathname}`,
      sourceId: "ranobes",
      url: url.href,
      title,
      author,
      description,
      coverUrl,
      language: "en",
    };
  },

  // eslint-disable-next-line require-yield
  async *getChapterList(_novel: NovelInfo, _io: AdapterIo): AsyncGenerator<ChapterRef[]> {
    // TODO(step 2): Ranobes exposes the chapter list on paginated
    // /chapters/<id>/ pages, with the data embedded as JSON in a script tag
    // (window.__DATA__). Parse that JSON first; fall back to anchor scraping.
    throw new Error("Ranobes chapter list extraction lands in step 2 (needs HTML fixtures).");
  },

  extractChapter(html: string, ref: ChapterRef): ExtractedChapter {
    // Verified 2026-07 against tests/fixtures/ranobes/chapter-page.html.
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Title lives in h1.title's first text node; a hidden separator span
    // and the parent-novel link follow it in the same element.
    const h1FirstTextNode = Array.from(doc.querySelector("h1.title")?.childNodes ?? []).find(
      (n) => n.nodeType === 3 && n.textContent?.trim(),
    )?.textContent?.trim();
    const title = h1FirstTextNode || ref.title;

    const article = doc.querySelector("#arrticle");
    if (!article) {
      throw new AdapterFetchError(`Ranobes chapter body not found: ${ref.url}`, "parse");
    }
    const clean = doc.createElement("div");
    sanitizeInto(article, clean, doc);

    return { title, bodyHtml: clean.innerHTML };
  },
};
