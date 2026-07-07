import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { onBroadcast, sendToBackground, sendToTab } from "@/core/messaging/bus";
import type { PageDetection } from "@/core/adapters/types";
import type { JobRecord } from "@/core/model/types";

/**
 * Popup = the whole UI. It answers "is this page supported?" and lists every
 * persisted EPUB job with live progress, so the workbench doesn't depend on
 * chrome.sidePanel (Chrome-only; unsupported on Opera) or on spawning a
 * separate browser tab. Progress while the popup is closed shows up as a
 * toolbar badge instead (see background/index.ts).
 */

type DetectionState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "detected"; tabId: number; detection: PageDetection };

function useDetection(): DetectionState {
  const [state, setState] = useState<DetectionState>({ kind: "loading" });

  useEffect(() => {
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
  }, []);

  return state;
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
  const detection = useDetection();
  const jobs = useJobs();

  return (
    <main style={{ width: 320, padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 16 }}>NovelForge</h1>

      {detection.kind === "loading" && <p className="muted">Checking this page…</p>}

      {detection.kind === "unsupported" && (
        <div className="card">
          <p style={{ margin: 0 }}>This page isn't a supported novel site.</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Open a novel on Ranobes, then try again.
          </p>
        </div>
      )}

      {detection.kind === "detected" && (
        <div className="card">
          <p style={{ margin: 0 }}>
            <strong>{detection.detection.siteLabel}</strong> ·{" "}
            <span className="muted">{detection.detection.pageKind} page</span>
          </p>
          {detection.detection.novel && (
            <p style={{ marginBottom: 0 }}>{detection.detection.novel.title}</p>
          )}
        </div>
      )}

      {jobs === null && <p className="muted">Loading jobs…</p>}

      {jobs?.length === 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>No EPUB jobs yet.</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Open a novel page and start one from here.
          </p>
        </div>
      )}

      {jobs?.map((job) => (
        <div className="card" key={job.id}>
          <p style={{ margin: 0 }}>
            <strong>{job.metadata.title}</strong>
          </p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {job.phase} · {job.progress.done}/{job.progress.total} chapters
            {job.progress.failed > 0 && ` · ${job.progress.failed} failed`}
          </p>
        </div>
      ))}
    </main>
  );
}
