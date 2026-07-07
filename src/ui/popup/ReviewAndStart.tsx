import { useEffect, useState } from "react";
import { onBroadcast, sendToBackground, sendToTab } from "@/core/messaging/bus";
import { ChapterListEditor } from "./ChapterListEditor";
import { MetadataForm } from "./MetadataForm";
import type { NovelInfo, ChapterState, EpubMetadata } from "@/core/model/types";

/**
 * Shown once the user asks to create an EPUB for a detected novel page.
 * Fetches the full chapter list, then lets the user edit metadata and
 * curate/reorder chapters before job/create actually persists anything.
 */
export function ReviewAndStart({
  tabId,
  novel,
  onDone,
}: {
  tabId: number;
  novel: NovelInfo;
  onDone: () => void;
}) {
  const [chapters, setChapters] = useState<ChapterState[] | null>(null);
  const [fetched, setFetched] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<EpubMetadata>({
    title: novel.title,
    author: novel.author ?? "",
    language: novel.language,
    description: novel.description,
    coverUrl: novel.coverUrl,
  });

  useEffect(() => {
    const unsubscribe = onBroadcast("chapterList/progress", ({ fetched: count }) => setFetched(count));
    void sendToTab(tabId, "novel/chapterList", { novel })
      .then((refs) => setChapters(refs.map((ref) => ({ ref, status: "pending", attempts: 0 }))))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  async function start() {
    if (!chapters) return;
    const survivors = chapters.filter((c) => c.status !== "skipped").map((c) => c.ref);
    await sendToBackground("job/create", { tabId, novel, metadata, chapters: survivors });
    onDone();
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <MetadataForm metadata={metadata} onChange={setMetadata} />

      {error && <p style={{ color: "#c33", margin: 0 }}>Couldn't fetch chapters: {error}</p>}

      {!error && chapters === null && (
        <p className="muted" style={{ margin: 0 }}>
          Fetching chapters… ({fetched} so far)
        </p>
      )}

      {chapters !== null && <ChapterListEditor chapters={chapters} onChange={setChapters} />}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => void start()} disabled={!chapters}>
          Start Download
          {chapters ? ` (${chapters.filter((c) => c.status !== "skipped").length} chapters)` : ""}
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
