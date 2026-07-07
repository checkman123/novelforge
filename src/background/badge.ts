import browser from "webextension-polyfill";
import { badgeTextFor } from "@/core/model/types";
import type { JobRecord } from "@/core/model/types";

/** Reflects job progress on the toolbar icon, scoped to the job's tab. */
export function updateBadge(job: JobRecord): void {
  if (job.tabId === undefined) return;
  void browser.action.setBadgeText({ tabId: job.tabId, text: badgeTextFor(job) });
}
