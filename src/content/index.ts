import { broadcast, createRouter } from "@/core/messaging/bus";
import { findAdapter, getAdapter } from "@/core/adapters/registry";
import { AdapterFetchError, type AdapterIo } from "@/core/adapters/types";
import type { ChapterRef } from "@/core/model/types";

/**
 * Content script: the extension's eyes and hands on the page.
 *
 * Runs only on hosts declared in the manifest, so every request below rides
 * the user's real session (cookies, anti-bot clearance) — the reason these
 * fetches happen here and not in the service worker.
 */

const io: AdapterIo = {
  async fetchHtml(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      throw new AdapterFetchError(`HTTP ${res.status} fetching ${url}`, "http", res.status);
    }
    return res.text();
  },
};

createRouter({
  "page/detect": () => {
    const url = new URL(location.href);
    const adapter = findAdapter(url);
    if (!adapter) return null;
    try {
      return adapter.detectPage(document, url);
    } catch (err) {
      console.warn("[novelforge] detectPage failed", err);
      return { siteId: adapter.id, siteLabel: adapter.label, pageKind: "unknown", novel: null };
    }
  },

  "novel/chapterList": async ({ novel }) => {
    const adapter = getAdapter(novel.sourceId);
    if (!adapter) throw new Error(`No adapter registered for source "${novel.sourceId}"`);
    const chapters: ChapterRef[] = [];
    for await (const batch of adapter.getChapterList(novel, io)) {
      chapters.push(...batch);
      broadcast("chapterList/progress", { fetched: chapters.length });
    }
    return chapters;
  },

  "chapter/fetch": async ({ ref }) => {
    const adapter = findAdapter(new URL(ref.url));
    if (!adapter) throw new Error(`No adapter matches chapter URL: ${ref.url}`);
    const html = await io.fetchHtml(ref.url);
    return adapter.extractChapter(html, ref);
  },
});
