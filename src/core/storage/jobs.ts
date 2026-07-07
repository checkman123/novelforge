import type { ChapterRef, EpubMetadata, JobRecord, JobSettings, NovelInfo } from "@/core/model/types";
import { computeProgress, DEFAULT_JOB_SETTINGS } from "@/core/model/types";
import { getDb, type StoredChapterContent } from "./db";

/** Repository for job records. Single writer: the background service worker. */

export interface CreateJobInput {
  tabId?: number;
  novel: NovelInfo;
  metadata: EpubMetadata;
  chapters: ChapterRef[];
  settings?: Partial<JobSettings>;
}

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  const now = Date.now();
  const chapters = input.chapters.map((ref) => ({
    ref,
    status: "pending" as const,
    attempts: 0,
  }));
  const job: JobRecord = {
    id: crypto.randomUUID(),
    tabId: input.tabId,
    novel: input.novel,
    metadata: input.metadata,
    chapters,
    settings: { ...DEFAULT_JOB_SETTINGS, ...input.settings },
    phase: "created",
    progress: computeProgress(chapters),
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put("jobs", job);
  return job;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const db = await getDb();
  return (await db.get("jobs", id)) ?? null;
}

export async function listJobs(): Promise<JobRecord[]> {
  const db = await getDb();
  const jobs = await db.getAllFromIndex("jobs", "by-updated");
  return jobs.reverse(); // newest first
}

/**
 * Read-modify-write inside one transaction, recomputing derived fields.
 * Returns the updated record, or null if the job no longer exists.
 */
export async function updateJob(
  id: string,
  mutate: (job: JobRecord) => void,
): Promise<JobRecord | null> {
  const db = await getDb();
  const tx = db.transaction("jobs", "readwrite");
  const job = await tx.store.get(id);
  if (!job) {
    await tx.done;
    return null;
  }
  mutate(job);
  job.progress = computeProgress(job.chapters);
  job.updatedAt = Date.now();
  await tx.store.put(job);
  await tx.done;
  return job;
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("jobs", id);
  // Cascade: remove stored chapter content for this job.
  const tx = db.transaction("chapterContent", "readwrite");
  const range = IDBKeyRange.bound([id, -Infinity], [id, Infinity]);
  for await (const cursor of tx.store.iterate(range)) {
    await cursor.delete();
  }
  await tx.done;
}

export async function putChapterContent(content: StoredChapterContent): Promise<void> {
  const db = await getDb();
  await db.put("chapterContent", content);
}

export async function getChapterContent(
  jobId: string,
  index: number,
): Promise<StoredChapterContent | null> {
  const db = await getDb();
  return (await db.get("chapterContent", [jobId, index])) ?? null;
}

/** All stored chapter content for a job, in no particular order. */
export async function listChapterContent(jobId: string): Promise<StoredChapterContent[]> {
  const db = await getDb();
  const range = IDBKeyRange.bound([jobId, -Infinity], [jobId, Infinity]);
  return db.getAll("chapterContent", range);
}
