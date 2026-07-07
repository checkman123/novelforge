import { createRouter } from "@/core/messaging/bus";
import { findAdapter } from "@/core/adapters/registry";

/**
 * Content script: the extension's eyes and hands on the page.
 *
 * Runs only on hosts declared in the manifest. Two responsibilities:
 *  1. Page detection via the adapter registry (answers "page/detect").
 *  2. (step 2/3) Same-origin chapter fetches on behalf of the pipeline, so
 *     requests carry the user's session and anti-bot clearance cookies.
 */

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
});
