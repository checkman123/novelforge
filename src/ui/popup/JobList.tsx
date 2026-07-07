import { useState } from "react";
import { sendToBackground } from "@/core/messaging/bus";
import { ChapterListEditor } from "./ChapterListEditor";
import { MetadataForm } from "./MetadataForm";
import type { JobRecord } from "@/core/model/types";

/** A job can only be edited (chapters/metadata) before assembly locks it in. */
function isEditable(phase: JobRecord["phase"]): boolean {
  return phase !== "assembling" && phase !== "done";
}

export function JobList({ jobs }: { jobs: JobRecord[] }) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  if (jobs.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>No EPUB jobs yet.</p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Open a novel page and start one from here.
        </p>
      </div>
    );
  }

  return (
    <>
      {jobs.map((job) => (
        <div className="card" key={job.id}>
          <p style={{ margin: 0 }}>
            <strong>{job.metadata.title}</strong>
          </p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {job.phase} · {job.progress.done}/{job.progress.total} chapters
            {job.progress.failed > 0 && ` · ${job.progress.failed} failed`}
          </p>
          {job.statusMessage && <p style={{ margin: "4px 0 0" }}>{job.statusMessage}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {job.phase === "paused" && (
              <button
                type="button"
                onClick={() => void sendToBackground("job/resume", { jobId: job.id })}
              >
                Resume
              </button>
            )}
            {isEditable(job.phase) && (
              <button
                type="button"
                onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
              >
                {expandedJobId === job.id ? "Close" : "Edit"}
              </button>
            )}
          </div>

          {expandedJobId === job.id && isEditable(job.phase) && (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <MetadataForm
                key={job.id}
                metadata={job.metadata}
                onChange={(metadata) =>
                  void sendToBackground("job/updateMetadata", { jobId: job.id, metadata })
                }
              />
              <ChapterListEditor
                chapters={job.chapters}
                onChange={(chapters) =>
                  void sendToBackground("job/setChapters", { jobId: job.id, chapters })
                }
              />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
