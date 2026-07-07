import { useState } from "react";
import { sortChapters } from "@/core/model/types";
import type { ChapterState } from "@/core/model/types";

/**
 * Reorderable (native drag-and-drop), removable chapter list. "Remove" always
 * toggles `status` to/from "skipped" rather than deleting the entry — the
 * caller decides what that means (pre-job: filtered out of the create
 * payload; post-job: persisted as "skipped" so already-downloaded content
 * isn't lost and the choice is reversible).
 */
export function ChapterListEditor({
  chapters,
  onChange,
}: {
  chapters: ChapterState[];
  onChange: (next: ChapterState[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...chapters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  }

  function toggleSkip(i: number) {
    onChange(
      chapters.map((c, idx) =>
        idx === i ? { ...c, status: c.status === "skipped" ? "pending" : "skipped" } : c,
      ),
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={() => onChange(sortChapters(chapters, "asc"))}>
          Sort ascending
        </button>
        <button type="button" onClick={() => onChange(sortChapters(chapters, "desc"))}>
          Sort descending
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 240, overflowY: "auto" }}>
        {chapters.map((c, i) => (
          <li
            key={c.ref.index}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) reorder(dragIndex, i);
              setDragIndex(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
              opacity: c.status === "skipped" ? 0.5 : 1,
            }}
          >
            <span aria-hidden="true" style={{ cursor: "grab" }}>
              ⠿
            </span>
            <span
              style={{
                flex: 1,
                textDecoration: c.status === "skipped" ? "line-through" : "none",
              }}
            >
              {c.ref.title}
            </span>
            <button type="button" onClick={() => toggleSkip(i)}>
              {c.status === "skipped" ? "Undo" : "Remove"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
