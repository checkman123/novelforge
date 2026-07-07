import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { JobRecord } from "@/core/model/types";

/**
 * IndexedDB layout. All durable state lives here so a killed MV3 service
 * worker (or a full browser restart) can resume any job losslessly.
 *
 *  - jobs:            one record per EPUB job, including chapter statuses
 *  - chapterContent:  cleaned XHTML per chapter, streamed in as fetched
 *                     (kept out of `jobs` so job updates stay small)
 */
export interface StoredChapterContent {
  jobId: string;
  index: number;
  title: string;
  bodyHtml: string;
}

interface NovelForgeDB extends DBSchema {
  jobs: {
    key: string;
    value: JobRecord;
    indexes: { "by-updated": number };
  };
  chapterContent: {
    key: [string, number]; // [jobId, chapter index]
    value: StoredChapterContent;
  };
}

let dbPromise: Promise<IDBPDatabase<NovelForgeDB>> | undefined;

export function getDb(): Promise<IDBPDatabase<NovelForgeDB>> {
  dbPromise ??= openDB<NovelForgeDB>("novelforge", 1, {
    upgrade(db) {
      const jobs = db.createObjectStore("jobs", { keyPath: "id" });
      jobs.createIndex("by-updated", "updatedAt");
      db.createObjectStore("chapterContent", { keyPath: ["jobId", "index"] });
    },
  });
  return dbPromise;
}
