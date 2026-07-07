# NovelForge — Web Novel to EPUB (Chrome Extension)

Downloads chapters from supported web-novel sites and builds a clean,
standards-compliant EPUB — entirely in the browser. No servers.

## Status: Step 1 — architecture scaffold (complete)

Working now: site detection end-to-end (content script → adapter registry →
popup), job persistence (background → IndexedDB → popup with live
broadcast updates), verified build, unit tests.

Roadmap: (2) Ranobes adapter from HTML fixtures · (3) resumable download
pipeline · (4) sanitiser + EPUB 3 builder · (5) full UI · (6) polish/options.

## Architecture

| Context | Role |
|---|---|
| **Content script** | Page detection + same-origin chapter fetches (rides the user's session, so anti-bot clearance cookies apply). Only injected on supported hosts. |
| **Service worker** | Job orchestrator. Holds no critical in-memory state: every transition is persisted to IndexedDB first, so SW eviction and browser restarts are survivable. |
| **Popup** | The whole UI: "is this page supported?", chapter selection, metadata, live job progress. Self-contained — no chrome.sidePanel (Chrome-only, unsupported on Opera). Progress while closed shows as a toolbar badge. |
| **Offscreen doc** | EPUB assembly (step 4) in a stable, DOM-capable context. |

### Layout
```
src/core/model/       Persisted domain types (treat changes as migrations)
src/core/messaging/   Typed message protocol + router (compile-time req/res)
src/core/storage/     IndexedDB repositories (jobs, chapter content), prefs
src/core/adapters/    SiteAdapter contract, registry, per-site folders
src/background,content,offscreen,ui/
```

**Adding a site** = one folder implementing `SiteAdapter` + one line in
`registry.ts`. `extractChapter` is deliberately a pure `string → data`
function so every adapter is testable against saved HTML fixtures.

## Develop

```bash
npm install
npm run build        # typecheck + build to dist/
npm test
# watch mode (two terminals):
npm run dev:ui
npm run dev:content
```

Load in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** →
select `dist/`.

## Design decisions worth knowing

- **Two Vite builds**: MV3 content scripts must be classic scripts, so the
  content script builds as an IIFE separately from the ESM contexts.
- **Fetching happens in the content script**, not the SW — ranobes.top sits
  behind bot protection that blocks out-of-session requests (verified).
- **`webextension-polyfill`** everywhere, including badge updates — no more
  Chrome-only APIs like `chrome.sidePanel` (dropped: unsupported on Opera).
- **Store-readiness**: host permissions are currently static for dev
  convenience; before Web Store submission they move to
  `optional_host_permissions` with on-demand grant + programmatic injection.
