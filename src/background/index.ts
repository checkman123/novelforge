import browser from "webextension-polyfill";
import { broadcast, createRouter } from "@/core/messaging/bus";
import { createJob, deleteJob, getJob, listJobs, updateJob } from "@/core/storage/jobs";
import { updateBadge } from "./badge";
import { initPipeline, runJobLoop } from "./pipeline";

/**
 * Background service worker: the job orchestrator.
 *
 * MV3 rule of thumb applied throughout: this worker can be killed at any
 * moment, so it holds no critical state in memory. Every handler reads from
 * and writes to IndexedDB; the download pipeline (pipeline.ts) persists each
 * state transition before acting on it and uses chrome.alarms as a resume
 * heartbeat.
 */

/** A job can only be edited (chapters/metadata) before assembly locks it in. */
function isEditable(phase: string): boolean {
  return phase !== "assembling" && phase !== "done";
}

createRouter({
  "job/create": async (payload) => {
    const job = await createJob(payload);
    await updateJob(job.id, (j) => {
      j.phase = "downloading";
    });
    const started = (await getJob(job.id)) ?? job;
    broadcast("job/updated", { job: started });
    updateBadge(started);
    runJobLoop(job.id);
    return { jobId: job.id };
  },

  "job/get": ({ jobId }) => getJob(jobId),

  "job/list": () => listJobs(),

  "job/delete": async ({ jobId }) => {
    await deleteJob(jobId);
    return { ok: true };
  },

  "job/setChapters": async ({ jobId, chapters }) => {
    const existing = await getJob(jobId);
    if (!existing || !isEditable(existing.phase)) return { ok: false };
    const updated = await updateJob(jobId, (j) => {
      j.chapters = chapters;
    });
    if (updated) broadcast("job/updated", { job: updated });
    return { ok: updated !== null };
  },

  "job/updateMetadata": async ({ jobId, metadata }) => {
    const existing = await getJob(jobId);
    if (!existing || !isEditable(existing.phase)) return { ok: false };
    const updated = await updateJob(jobId, (j) => {
      Object.assign(j.metadata, metadata);
    });
    if (updated) broadcast("job/updated", { job: updated });
    return { ok: updated !== null };
  },

  "job/resume": async ({ jobId }) => {
    const existing = await getJob(jobId);
    if (!existing || existing.phase !== "paused") return { ok: false };
    const updated = await updateJob(jobId, (j) => {
      j.phase = "downloading";
      j.statusMessage = undefined;
    });
    if (updated) {
      broadcast("job/updated", { job: updated });
      updateBadge(updated);
      runJobLoop(jobId);
    }
    return { ok: updated !== null };
  },
});

browser.runtime.onInstalled.addListener(({ reason }) => {
  console.info(`[novelforge] installed (${reason})`);
});

initPipeline();
