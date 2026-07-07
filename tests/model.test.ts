import { describe, expect, it } from "vitest";
import { badgeTextFor, computeProgress, DEFAULT_JOB_SETTINGS } from "@/core/model/types";
import type { ChapterState, JobPhase, JobRecord } from "@/core/model/types";

const ch = (index: number, status: ChapterState["status"]): ChapterState => ({
  ref: { index, title: `Chapter ${index}`, url: `https://x/${index}.html` },
  status,
  attempts: 0,
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
