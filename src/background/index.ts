import browser from "webextension-polyfill";
import { broadcast, createRouter } from "@/core/messaging/bus";
import { createJob, deleteJob, getJob, listJobs } from "@/core/storage/jobs";
import { badgeTextFor, type JobRecord } from "@/core/model/types";

/**
 * Background service worker: the job orchestrator.
 *
 * MV3 rule of thumb applied throughout: this worker can be killed at any
 * moment, so it holds no critical state in memory. Every handler reads from
 * and writes to IndexedDB; step 3 adds the download pipeline, which will
 * persist each state transition before acting on it and use chrome.alarms
 * as a resume heartbeat.
 */

/** Reflects job progress on the toolbar icon, scoped to the job's tab. */
function updateBadge(job: JobRecord): void {
  if (job.tabId === undefined) return;
  void browser.action.setBadgeText({ tabId: job.tabId, text: badgeTextFor(job) });
}

createRouter({
  "job/create": async (payload) => {
    const job = await createJob(payload);
    broadcast("job/updated", { job });
    updateBadge(job);
    return { jobId: job.id };
  },

  "job/get": ({ jobId }) => getJob(jobId),

  "job/list": () => listJobs(),

  "job/delete": async ({ jobId }) => {
    await deleteJob(jobId);
    return { ok: true };
  },
});

browser.runtime.onInstalled.addListener(({ reason }) => {
  console.info(`[novelforge] installed (${reason})`);
});
