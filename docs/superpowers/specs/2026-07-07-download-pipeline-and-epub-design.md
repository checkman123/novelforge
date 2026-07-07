# Download pipeline, EPUB assembly, and chapter/metadata review UI

## Context

Steps 1–2 are done: site detection, job persistence, the Ranobes adapter's
`getNovelInfo`/`extractChapter` (fixture-verified), and a self-contained popup
UI. What's still stubbed: `getChapterList` (needs a TOC fixture — see below),
the actual chapter download loop, and EPUB assembly (`src/offscreen/main.ts`
is a one-line placeholder). This spec covers all three, plus the UI to
configure a job before it starts and to review/adjust it afterward.

## Job lifecycle

```
(no job yet)
  → [Review & Start screen]        popup fetches full chapter list, user edits
  → job/create                     → phase "created"
  → "downloading"                  one chapter at a time, paced
  → "assembling"                   offscreen doc builds the EPUB
  → "done" | "failed"
  (→ "paused" if the source tab closes mid-download)
```

No new `JobPhase`/`ChapterStatus` values are needed — `"skipped"`, `"paused"`,
`"assembling"` etc. already exist in `src/core/model/types.ts`.

## 1. Review & Start screen (popup)

Replaces today's bare detection card when the current page is a supported
novel. Sequence:

1. Popup calls `sendToTab(tabId, "novel/chapterList", { novel })` (new
   message, handled directly by the content script — same pattern as
   `page/detect`, no background hop needed). Content script runs
   `adapter.getChapterList(novel, io)`, collecting every yielded batch into
   one array before replying, and also broadcasts `chapterList/progress`
   after each batch (`{ fetched: number }`) so the popup can show "Fetched
   140 chapters…" instead of a bare spinner.
2. Popup shows: editable `title` / `description` / cover (image URL input,
   defaulting to `NovelInfo.coverUrl`), and the chapter list — each row has a
   remove button (marks `"skipped"`, doesn't delete), is drag-reorderable,
   plus one-click "Sort ascending / descending" (by the original scrape
   order, i.e. `ChapterRef.index`) as a shortcut over manual dragging.
3. **Start Download** calls `job/create` with the finalized chapter order
   (array order = EPUB spine order, independent of `ref.index`, which stays
   a stable per-chapter identifier for `chapterContent` lookups regardless of
   later reordering) and the edited `EpubMetadata`.

After creation, the same chapter list and metadata form reappear in the job's
row in the popup's job list (today's plain list becomes expandable), editable
via:

- `job/setChapters { jobId, chapters: ChapterState[] }` — replaces the whole
  array (order + skip flags) in one shot. Simplest single message kind that
  covers drag, remove, and sort.
- `job/updateMetadata { jobId, metadata: Partial<EpubMetadata> }`

Both are only meaningful before phase `"assembling"`; the background handler
rejects the call otherwise (job already locked in).

## 2. Download pipeline

**Content script** gains:

- An `AdapterIo` implementation: `fetchHtml(url)` does
  `fetch(url, { credentials: "include" })`, throwing `AdapterFetchError` with
  kind `"http"` on non-2xx. (Anti-bot *challenge* detection — e.g.
  recognizing a Cloudflare interstitial instead of just a non-2xx — is a
  known gap, out of scope here; falls under the generic `"http"` kind for
  now.)
- `chapter/fetch(ref) → ExtractedChapter` — `io.fetchHtml(ref.url)` then
  `adapter.extractChapter(html, ref)`. Runs in the content script (not the
  background) because `extractChapter` needs `DOMParser`, which service
  workers don't have.
- `novel/chapterList(novel) → ChapterRef[]` (section 1 above).

**Background** gains a per-job async loop: while phase is `"downloading"`,
process the next `"pending"` (or retryable `"failed"`, up to
`settings.maxAttempts`) chapter, `await sendToTab(job.tabId, "chapter/fetch",
{ ref })`, persist the result (`putChapterContent` + `updateJob` chapter
status), `broadcast("job/updated")` + `updateBadge`, wait
`settings.requestIntervalMs`, repeat. Each real async step (the message to
the content script) keeps the service worker alive naturally.

Safety net: a repeating `chrome.alarms` (1-minute floor, the MV3 minimum)
checks every tick for a job whose phase is `"downloading"` but which has no
loop currently running in memory (tracked via a `Set<jobId>` of active
loops) — e.g. after the service worker was evicted or the browser restarted
— and restarts its loop from the next pending chapter. Because every chapter
result is persisted before moving on, a kill mid-job loses at most the one
in-flight chapter.

If `job.tabId`'s tab no longer exists (`sendToTab` throws), phase → `"paused"`
with `statusMessage` asking the user to reopen a tab on the site; the loop
stops until the user resumes (resume affordance is a button in the popup
calling a `job/resume` message that just flips phase back to `"downloading"`
and restarts the loop).

Once every chapter is `"done"` or `"skipped"`, phase → `"assembling"` and
background triggers EPUB assembly (section 3).

## 3. EPUB assembly (offscreen document)

Background ensures the offscreen document exists (`chrome.offscreen`) and
sends `epub/assemble { jobId }`. The offscreen doc:

1. Reads the `JobRecord` and all its `chapterContent` rows directly from
   IndexedDB (it has full DOM + IndexedDB access, unlike the service worker).
2. Builds a standard EPUB 3 with **JSZip** (already named in the existing
   `offscreen/main.ts` comment): uncompressed `mimetype` entry first,
   `META-INF/container.xml`, `content.opf` (metadata: title, author,
   language, description, cover reference, spine in chapter-array order),
   `nav.xhtml`, one XHTML file per non-skipped chapter (wraps its sanitized
   `bodyHtml`), and the cover image (fetched from `metadata.coverUrl`,
   embedded by mime-sniffed extension).
3. Creates a Blob URL and calls `chrome.downloads.download()` itself —
   offscreen documents have full extension API access, so there's no need to
   ship EPUB bytes back through message-passing.
4. Replies `{ ok: true }` or `{ ok: false, error }`; background sets phase to
   `"done"` / `"failed"` accordingly and clears/sets the toolbar badge.

New dependency: `jszip`.

## 4. Refresh button

Small, independent addition: a button top-right of the popup that re-runs
the same `page/detect` call the popup already makes on mount, for when the
user navigates within the tab without reopening the popup.

## New message protocol additions

```ts
"novel/chapterList": { req: { novel: NovelInfo }; res: ChapterRef[] };
"chapterList/progress": { req: { fetched: number }; res: void }; // broadcast
"chapter/fetch": { req: { ref: ChapterRef }; res: ExtractedChapter };
"job/setChapters": { req: { jobId: string; chapters: ChapterState[] }; res: { ok: boolean } };
"job/updateMetadata": { req: { jobId: string; metadata: Partial<EpubMetadata> }; res: { ok: boolean } };
"job/resume": { req: { jobId: string }; res: { ok: boolean } };
"epub/assemble": { req: { jobId: string }; res: { ok: boolean; error?: string } };
```

## Testing

TDD as usual for anything pure:

- EPUB structure building: factor into a pure-ish function,
  `buildEpub(job: JobRecord, chapters: StoredChapterContent[]): JSZip` (or
  returns the generated file entries), so zip contents can be asserted
  without touching `chrome.downloads` or IndexedDB. The offscreen `main.ts`
  wiring (IndexedDB read, `downloads.download`) stays thin and untested, same
  bar as the rest of this repo's browser-glue code.
- Chapter reordering/sort-shortcut logic: a pure function,
  `sortChapters(chapters: ChapterState[], direction: "asc" | "desc"):
  ChapterState[]`, TDD'd directly.
- `chapter/fetch` and `novel/chapterList` content-script handlers: thin glue
  over already-tested `adapter.extractChapter` / `adapter.getChapterList` —
  no new tests beyond what the adapter fixtures already cover.
- The background per-job loop and alarm-resume logic: not unit-testable
  without significant mock infra this repo doesn't have (chrome.alarms,
  timers, message round-trips). Same bar as existing background code —
  verified by typecheck + build + manual testing once the TOC fixture lands.
- Popup UI (Review & Start screen, drag-and-drop, job list edits): no new
  test infra, consistent with the rest of this repo's UI code.

## Out of scope

- Chapter subset/range selection at creation time (full list only; remove
  individual chapters afterward instead — already decided).
- Concurrent chapter fetching (sequential only, paced by
  `requestIntervalMs`).
- Anti-bot challenge *detection* (Cloudflare interstitials etc.) — currently
  folds into the generic HTTP-error path.
- Cover image resizing/processing — embedded as fetched.
- `getChapterList`'s actual Ranobes implementation is blocked on a saved TOC
  fixture (`https://ranobes.top/chapters/1207185/`) — this spec's pipeline
  code doesn't depend on knowing that page's shape, but live end-to-end
  testing on the real site does.
