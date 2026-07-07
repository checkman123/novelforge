import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { onBroadcast, sendToBackground, sendToTab } from "@/core/messaging/bus";
import { JobList } from "./JobList";
import { ReviewAndStart } from "./ReviewAndStart";
import type { PageDetection } from "@/core/adapters/types";
import type { JobRecord } from "@/core/model/types";

/**
 * Popup = the whole UI. It answers "is this page supported?", offers to
 * create an EPUB job for it (Review & Start), and lists every persisted job
 * with live progress — self-contained, no chrome.sidePanel (Chrome-only;
 * unsupported on Opera). Progress while the popup is closed shows up as a
 * toolbar badge instead (see background/index.ts).
 */

type DetectionState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "detected"; tabId: number; detection: PageDetection };

function useDetection(): [DetectionState, () => void] {
  const [state, setState] = useState<DetectionState>({ kind: "loading" });

  function refresh() {
    setState({ kind: "loading" });
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) return setState({ kind: "unsupported" });
      try {
        const detection = await sendToTab(tab.id, "page/detect", {});
        setState(
          detection
            ? { kind: "detected", tabId: tab.id, detection }
            : { kind: "unsupported" },
        );
      } catch {
        // No content script in this tab → not a supported site.
        setState({ kind: "unsupported" });
      }
    })();
  }

  useEffect(refresh, []);

  return [state, refresh];
}

function useJobs(): JobRecord[] | null {
  const [jobs, setJobs] = useState<JobRecord[] | null>(null);

  useEffect(() => {
    const refresh = () => void sendToBackground("job/list", {}).then(setJobs);
    refresh();
    return onBroadcast("job/updated", refresh);
  }, []);

  return jobs;
}

export function PopupApp() {
  const [detection, refreshDetection] = useDetection();
  const jobs = useJobs();
  const [reviewing, setReviewing] = useState(false);

  return (
    <main style={{ width: 320, padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 16 }}>NovelForge</h1>
        <button
          type="button"
          title="Re-check the current page"
          aria-label="Refresh"
          onClick={refreshDetection}
        >
          ⟳
        </button>
      </div>

      {detection.kind === "loading" && <p className="muted">Checking this page…</p>}

      {detection.kind === "unsupported" && (
        <div className="card">
          <p style={{ margin: 0 }}>This page isn't a supported novel site.</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Open a novel on Ranobes, then try again.
          </p>
        </div>
      )}

      {detection.kind === "detected" && !reviewing && (
        <div className="card">
          <p style={{ margin: 0 }}>
            <strong>{detection.detection.siteLabel}</strong> ·{" "}
            <span className="muted">{detection.detection.pageKind} page</span>
          </p>
          {detection.detection.novel && (
            <>
              <p style={{ marginBottom: 8 }}>{detection.detection.novel.title}</p>
              <button type="button" onClick={() => setReviewing(true)}>
                Create EPUB
              </button>
            </>
          )}
        </div>
      )}

      {detection.kind === "detected" && reviewing && detection.detection.novel && (
        <ReviewAndStart
          tabId={detection.tabId}
          novel={detection.detection.novel}
          onDone={() => setReviewing(false)}
        />
      )}

      {jobs === null ? <p className="muted">Loading jobs…</p> : <JobList jobs={jobs} />}
    </main>
  );
}
