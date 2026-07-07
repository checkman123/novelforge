import { describe, expect, it } from "vitest";
import {
  badgeTextFor,
  computeProgress,
  DEFAULT_JOB_SETTINGS,
  pickNextChapter,
  sortChapters,
} from "@/core/model/types";
import type { ChapterState, JobPhase, JobRecord } from "@/core/model/types";

const ch = (index: number, status: ChapterState["status"], attempts = 0): ChapterState => ({
  ref: { index, title: `Chapter ${index}`, url: `https://x/${index}.html` },
  status,
  attempts,
});

describe("computeProgress", () => {
  it("counts done and failed chapters", () => {
    const progress = computeProgress([ch(0, "done"), ch(1, "failed"), ch(2, "pending"), ch(3, "done")]);
    expect(progress).toEqual({ total: 4, done: 2, failed: 1 });
  });

  it("handles empty selections", () => {
    expect(computeProgress([])).toEqual({ total: 0, done: 0, failed: 0 });
  });
});

const job = (phase: JobPhase, chapters: ChapterState[] = []): JobRecord => ({
  id: "job-1",
  tabId: 7,
  novel: { id: "ranobes:1", sourceId: "ranobes", url: "https://x", title: "T", language: "en" },
  metadata: { title: "T", author: "A", language: "en" },
  chapters,
  settings: DEFAULT_JOB_SETTINGS,
  phase,
  progress: computeProgress(chapters),
  createdAt: 0,
  updatedAt: 0,
});

describe("badgeTextFor", () => {
  it("shows done/total progress while downloading", () => {
    const chapters = [ch(0, "done"), ch(1, "pending"), ch(2, "pending")];
    expect(badgeTextFor(job("downloading", chapters))).toBe("1/3");
  });

  it("shows done/total progress while assembling the EPUB", () => {
    const chapters = [ch(0, "done"), ch(1, "done")];
    expect(badgeTextFor(job("assembling", chapters))).toBe("2/2");
  });

  it("flags failed jobs", () => {
    expect(badgeTextFor(job("failed"))).toBe("!");
  });

  it("shows nothing for created, paused, done, or cancelled jobs", () => {
    expect(badgeTextFor(job("created"))).toBe("");
    expect(badgeTextFor(job("paused"))).toBe("");
    expect(badgeTextFor(job("done"))).toBe("");
    expect(badgeTextFor(job("cancelled"))).toBe("");
  });
});

describe("sortChapters", () => {
  it("sorts ascending by original chapter index", () => {
    const chapters = [ch(2, "pending"), ch(0, "pending"), ch(1, "pending")];
    expect(sortChapters(chapters, "asc").map((c) => c.ref.index)).toEqual([0, 1, 2]);
  });

  it("sorts descending by original chapter index", () => {
    const chapters = [ch(0, "pending"), ch(2, "pending"), ch(1, "pending")];
    expect(sortChapters(chapters, "desc").map((c) => c.ref.index)).toEqual([2, 1, 0]);
  });

  it("does not mutate the input array", () => {
    const chapters = [ch(1, "pending"), ch(0, "pending")];
    const original = [...chapters];
    sortChapters(chapters, "asc");
    expect(chapters).toEqual(original);
  });
});

describe("pickNextChapter", () => {
  it("picks the first pending chapter", () => {
    const chapters = [ch(0, "done"), ch(1, "pending"), ch(2, "pending")];
    expect(pickNextChapter(job("downloading", chapters))?.ref.index).toBe(1);
  });

  it("retries a failed chapter that hasn't hit maxAttempts", () => {
    const chapters = [ch(0, "failed", 1)];
    expect(pickNextChapter(job("downloading", chapters))?.ref.index).toBe(0);
  });

  it("skips a failed chapter that has hit maxAttempts", () => {
    const chapters = [ch(0, "failed", DEFAULT_JOB_SETTINGS.maxAttempts), ch(1, "pending")];
    expect(pickNextChapter(job("downloading", chapters))?.ref.index).toBe(1);
  });

  it("returns undefined when nothing is pending or retryable", () => {
    const chapters = [
      ch(0, "done"),
      ch(1, "skipped"),
      ch(2, "failed", DEFAULT_JOB_SETTINGS.maxAttempts),
    ];
    expect(pickNextChapter(job("downloading", chapters))).toBeUndefined();
  });
});
