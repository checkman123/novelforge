/**
 * Domain model shared by every extension context.
 * These types are persisted to IndexedDB — treat changes as schema migrations.
 */

/** A supported source site, keyed by adapter id (e.g. "ranobes"). */
export type SourceId = string;

export interface NovelInfo {
  /** Stable identity: `${sourceId}:${novelKey}` where novelKey is site-specific. */
  id: string;
  sourceId: SourceId;
  /** Canonical URL of the novel's landing page. */
  url: string;
  title: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  /** BCP-47 tag, defaults to "en". Used for EPUB dc:language. */
  language: string;
}

/** A chapter as it appears in the table of contents (no content yet). */
export interface ChapterRef {
  /** 0-based position in reading order. */
  index: number;
  title: string;
  url: string;
}

export type ChapterStatus = "pending" | "fetching" | "done" | "failed" | "skipped";

export interface ChapterState {
  ref: ChapterRef;
  status: ChapterStatus;
  attempts: number;
  /** Human-readable error for the last failed attempt. */
  error?: string;
}

/** User-editable metadata that ends up in the EPUB package document. */
export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  description?: string;
  coverUrl?: string;
}

export interface JobSettings {
  /** Minimum delay between chapter requests, in ms. */
  requestIntervalMs: number;
  /** Max fetch attempts per chapter before it is marked failed. */
  maxAttempts: number;
  /** When true, failed chapters become placeholder pages instead of aborting. */
  placeholderForFailed: boolean;
}

export type JobPhase =
  | "created"      // job persisted, not yet started
  | "downloading"  // fetching chapter content
  | "paused"       // user paused, or waiting for anti-bot challenge
  | "assembling"   // building the EPUB in the offscreen document
  | "done"         // EPUB handed to chrome.downloads
  | "failed"       // unrecoverable
  | "cancelled";

export interface JobProgress {
  total: number;
  done: number;
  failed: number;
}

export interface JobRecord {
  id: string;
  /** Tab the job was started from; content-script fetches go through it. */
  tabId?: number;
  novel: NovelInfo;
  metadata: EpubMetadata;
  chapters: ChapterState[];
  settings: JobSettings;
  phase: JobPhase;
  progress: JobProgress;
  /** Set when phase is "failed" or "paused" for a reason worth showing. */
  statusMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_JOB_SETTINGS: JobSettings = {
  requestIntervalMs: 1200,
  maxAttempts: 3,
  placeholderForFailed: true,
};

export function computeProgress(chapters: ChapterState[]): JobProgress {
  let done = 0;
  let failed = 0;
  for (const c of chapters) {
    if (c.status === "done") done++;
    else if (c.status === "failed") failed++;
  }
  return { total: chapters.length, done, failed };
}

/** Toolbar badge text for a job, since the popup can't stay open persistently. */
export function badgeTextFor(job: JobRecord): string {
  switch (job.phase) {
    case "downloading":
    case "assembling":
      return `${job.progress.done}/${job.progress.total}`;
    case "failed":
      return "!";
    default:
      return "";
  }
}
