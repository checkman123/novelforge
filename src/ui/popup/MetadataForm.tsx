import { useState } from "react";
import type { EpubMetadata } from "@/core/model/types";

/**
 * Title/author/description/cover editor. Text fields buffer locally and
 * commit onBlur (rather than on every keystroke) so callers that persist
 * changes remotely — e.g. job/updateMetadata — aren't spammed mid-typing.
 */
export function MetadataForm({
  metadata,
  onChange,
}: {
  metadata: EpubMetadata;
  onChange: (next: EpubMetadata) => void;
}) {
  const [draft, setDraft] = useState(metadata);

  function commit() {
    if (draft !== metadata) onChange(draft);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 2 }}>
        <span className="muted">Title</span>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={commit}
        />
      </label>
      <label style={{ display: "grid", gap: 2 }}>
        <span className="muted">Author</span>
        <input
          value={draft.author}
          onChange={(e) => setDraft({ ...draft, author: e.target.value })}
          onBlur={commit}
        />
      </label>
      <label style={{ display: "grid", gap: 2 }}>
        <span className="muted">Cover image URL</span>
        <input
          value={draft.coverUrl ?? ""}
          onChange={(e) => setDraft({ ...draft, coverUrl: e.target.value || undefined })}
          onBlur={commit}
        />
      </label>
      <label style={{ display: "grid", gap: 2 }}>
        <span className="muted">Description</span>
        <textarea
          rows={3}
          value={draft.description ?? ""}
          onChange={(e) => setDraft({ ...draft, description: e.target.value || undefined })}
          onBlur={commit}
        />
      </label>
    </div>
  );
}
