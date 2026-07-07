import browser from "webextension-polyfill";
import { broadcast, sendToBackground, sendToTab } from "@/core/messaging/bus";
import { pickNextChapter } from "@/core/model/types";
import { getJob, listJobs, putChapterContent, updateJob } from "@/core/storage/jobs";
import { updateBadge } from "./badge";

/**
 * Download pipeline orchestration. One async loop per job, paced by
 * `settings.requestIntervalMs`; each iteration does real async work (a
 * message round-trip to the content script), which keeps the service worker
 * alive naturally. A repeating alarm is the safety net for when the worker
 * *does* get evicted (or the browser restarts) mid-job.
 */

const RESUME_ALARM = "novelforge-resume-downloads";

/** jobIds with a loop currently running in this service worker instance. */
const activeLoops = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tabExists(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

async function publish(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  broadcast("job/updated", { job });
  updateBadge(job);
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "src/offscreen/index.html",
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: "Assemble downloaded chapters into an EPUB and trigger the file download.",
  });
}

async function beginAssembly(jobId: string): Promise<void> {
  await updateJob(jobId, (j) => {
    j.phase = "assembling";
  });
  await publish(jobId);

  await ensureOffscreenDocument();
  // Addressed to the offscreen document's router, not the background itself —
  // sendToBackground is just a typed runtime.sendMessage under the hood.
  const result = await sendToBackground("epub/assemble", { jobId });

  await updateJob(jobId, (j) => {
    j.phase = result.ok ? "done" : "failed";
    if (!result.ok) j.statusMessage = result.error;
  });
  await publish(jobId);
}

/** Starts (or no-ops if already running) the download loop for one job. */
export function runJobLoop(jobId: string): void {
  if (activeLoops.has(jobId)) return;
  activeLoops.add(jobId);
  void driveJobLoop(jobId).finally(() => activeLoops.delete(jobId));
}

async function driveJobLoop(jobId: string): Promise<void> {
  for (;;) {
    const job = await getJob(jobId);
    if (!job || job.phase !== "downloading") return;

    const next = pickNextChapter(job);
    if (!next) {
      const stuck = job.chapters.filter(
        (c) => c.status === "failed" && c.attempts >= job.settings.maxAttempts,
      );
      if (stuck.length > 0 && !job.settings.placeholderForFailed) {
        await updateJob(jobId, (j) => {
          j.phase = "failed";
          j.statusMessage = `${stuck.length} chapter(s) failed after ${job.settings.maxAttempts} attempts.`;
        });
        await publish(jobId);
        return;
      }
      await beginAssembly(jobId);
      return;
    }

    if (job.tabId === undefined || !(await tabExists(job.tabId))) {
      await updateJob(jobId, (j) => {
        j.phase = "paused";
        j.statusMessage = "Reopen a tab on the site, then resume this job.";
      });
      await publish(jobId);
      return;
    }

    try {
      const extracted = await sendToTab(job.tabId, "chapter/fetch", { ref: next.ref });
      await putChapterContent({
        jobId,
        index: next.ref.index,
        title: extracted.title,
        bodyHtml: extracted.bodyHtml,
      });
      await updateJob(jobId, (j) => {
        const chapter = j.chapters.find((c) => c.ref.index === next.ref.index);
        if (chapter) chapter.status = "done";
      });
    } catch (err) {
      await updateJob(jobId, (j) => {
        const chapter = j.chapters.find((c) => c.ref.index === next.ref.index);
        if (chapter) {
          chapter.attempts += 1;
          chapter.status = "failed";
          chapter.error = err instanceof Error ? err.message : String(err);
        }
      });
    }

    await publish(jobId);
    await sleep(job.settings.requestIntervalMs);
  }
}

/** Resumes any job stuck in "downloading" with no loop running in this worker instance. */
async function resumeStalledJobs(): Promise<void> {
  const jobs = await listJobs();
  for (const job of jobs) {
    if (job.phase === "downloading" && !activeLoops.has(job.id)) {
      runJobLoop(job.id);
    }
  }
}

/** Wires the alarm-based resume safety net and picks up any stalled jobs now. */
export function initPipeline(): void {
  browser.alarms.create(RESUME_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RESUME_ALARM) void resumeStalledJobs();
  });
  void resumeStalledJobs();
}
