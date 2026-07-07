import type { ExtractedChapter, PageDetection } from "@/core/adapters/types";
import type {
  ChapterRef,
  ChapterState,
  EpubMetadata,
  JobRecord,
  JobSettings,
  NovelInfo,
} from "@/core/model/types";

/**
 * Every cross-context message, typed end-to-end.
 * Key format: "<audience>/<verb>". Handlers are registered per key, and both
 * sender and receiver get compile-time req/res checking via MessageMap.
 */
export interface MessageMap {
  /** popup → content script: what page is this? */
  "page/detect": { req: Record<never, never>; res: PageDetection | null };

  /** popup → background: create a job (not started yet). */
  "job/create": {
    req: {
      tabId: number;
      novel: NovelInfo;
      metadata: EpubMetadata;
      chapters: ChapterRef[];
      settings?: Partial<JobSettings>;
    };
    res: { jobId: string };
  };

  "job/get": { req: { jobId: string }; res: JobRecord | null };
  "job/list": { req: Record<never, never>; res: JobRecord[] };
  "job/delete": { req: { jobId: string }; res: { ok: boolean } };

  /** popup → background: replace a job's chapter order/skip flags wholesale. */
  "job/setChapters": {
    req: { jobId: string; chapters: ChapterState[] };
    res: { ok: boolean };
  };

  /** popup → background: edit book title/author/description/cover. */
  "job/updateMetadata": {
    req: { jobId: string; metadata: Partial<EpubMetadata> };
    res: { ok: boolean };
  };

  /** popup → background: restart a paused job's download loop. */
  "job/resume": { req: { jobId: string }; res: { ok: boolean } };

  /** popup → content script: fetch the full chapter list for a novel. */
  "novel/chapterList": { req: { novel: NovelInfo }; res: ChapterRef[] };

  /** content script → popup broadcast: chapter list fetch progress. */
  "chapterList/progress": { req: { fetched: number }; res: void };

  /** background → content script: fetch + sanitise one chapter's content. */
  "chapter/fetch": { req: { ref: ChapterRef }; res: ExtractedChapter };

  /** background → offscreen doc: assemble and download a job's EPUB. */
  "epub/assemble": { req: { jobId: string }; res: { ok: boolean; error?: string } };

  /** background → popup broadcast: a job changed. */
  "job/updated": { req: { job: JobRecord }; res: void };
}

export type MessageKind = keyof MessageMap;
export type MessageReq<K extends MessageKind> = MessageMap[K]["req"];
export type MessageRes<K extends MessageKind> = MessageMap[K]["res"];

export interface Envelope<K extends MessageKind = MessageKind> {
  ns: "novelforge";
  kind: K;
  payload: MessageReq<K>;
}

export function envelope<K extends MessageKind>(kind: K, payload: MessageReq<K>): Envelope<K> {
  return { ns: "novelforge", kind, payload };
}

export function isEnvelope(x: unknown): x is Envelope {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Envelope).ns === "novelforge" &&
    typeof (x as Envelope).kind === "string"
  );
}
