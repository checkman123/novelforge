import type { ChapterRef, NovelInfo } from "@/core/model/types";

/** What kind of page the user is currently on. */
export type PageKind = "novel" | "chapter" | "toc" | "unknown";

export interface PageDetection {
  siteId: string;
  siteLabel: string;
  pageKind: PageKind;
  /** Present when the page (or a page it links to) identifies a novel. */
  novel: NovelInfo | null;
}

/** IO surface handed to adapters. Implemented by the content script so all
 *  requests ride the user's real session (cookies, anti-bot clearance). */
export interface AdapterIo {
  /** Fetch a same-site URL and return its HTML. Throws AdapterFetchError. */
  fetchHtml(url: string): Promise<string>;
}

export interface ExtractedChapter {
  title: string;
  /** Sanitised, well-formed inner HTML (allowlisted tags only). */
  bodyHtml: string;
}

/**
 * One implementation per supported site. Everything that knows about a site's
 * URL scheme or DOM structure lives behind this interface; the pipeline,
 * storage and EPUB layers never see site specifics.
 *
 * Methods taking a Document run in the content script. `extractChapter` is a
 * pure string→data function so it can be unit-tested against HTML fixtures.
 */
export interface SiteAdapter {
  readonly id: string;
  readonly label: string;

  /** Cheap URL test used for routing. */
  matches(url: URL): boolean;

  /** Identify the current page and, if possible, the novel it belongs to. */
  detectPage(doc: Document, url: URL): PageDetection;

  /** Full novel metadata from a novel landing page. */
  getNovelInfo(doc: Document, url: URL): NovelInfo | null;

  /**
   * Stream the complete chapter list in reading order. Yields batches so the
   * UI can render progressively for novels with thousands of chapters.
   */
  getChapterList(novel: NovelInfo, io: AdapterIo): AsyncGenerator<ChapterRef[]>;

  /** Parse one chapter page's raw HTML into clean content. Pure. */
  extractChapter(html: string, ref: ChapterRef): ExtractedChapter;
}

export class AdapterFetchError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "http" | "challenge" | "parse",
    readonly status?: number,
  ) {
    super(message);
    this.name = "AdapterFetchError";
  }
}
