# Drop the side panel — merge workbench into the popup

## Context

The extension currently has two UI surfaces:

- **Popup** (`src/ui/popup/`) — launcher. Detects whether the current tab is a
  supported novel page and offers to open the workbench.
- **Side panel** (`src/ui/sidepanel/`) — workbench. Lists persisted EPUB jobs
  and live-updates via `job/updated` broadcasts.

The popup opens the side panel via `chrome.sidePanel.open()`, which is a
Chrome-specific API. Opera doesn't implement it at all, so the "Open
NovelForge panel" button silently did nothing there. A prior fix added a
fallback that opened the side panel's page as a plain browser tab when
`chrome.sidePanel` was unavailable — but that isn't "self-contained": it drops
the workbench into the middle of the user's regular browsing tabs.

Decision: stop using `chrome.sidePanel` entirely. Merge the workbench into the
popup itself, so the extension has exactly one self-contained UI surface.

## Scope

### Remove

- `side_panel` key and `"sidePanel"` permission from `public/manifest.json`.
- `src/ui/sidepanel/` in its entirety (`App.tsx`, `index.html`, `main.tsx`) and
  its `sidepanel` build entry in `vite.config.ts`.
- `src/ui/popup/openPanel.ts` and `tests/popup-open-panel.test.ts` — the
  side-panel-vs-tab fallback logic no longer has a reason to exist.

### Popup becomes the single surface

`PopupApp` keeps its existing detection card ("is this page supported?") and,
when supported, the start-job affordance. Below that, it always renders the
job list that `SidePanelApp` used to own — regardless of whether the current
page is a supported novel site, so a running or finished job can be checked
from any tab. It subscribes to `job/updated` broadcasts the same way
`SidePanelApp` did, for as long as the popup happens to be open.

Known, accepted tradeoff: a browser-action popup closes on blur (click
elsewhere, switch tabs), unlike the side panel which stayed open across
navigation. There is no fix for this within the popup surface — it's inherent
to how `default_popup` works. The toolbar badge (below) covers the gap.

### Toolbar badge for progress

Add a pure function in `src/core/model/types.ts` (alongside `computeProgress`,
which it depends on for shape but not logic):

```ts
export function badgeTextFor(job: JobRecord): string {
  switch (job.phase) {
    case "downloading":
    case "assembling":
      return `${job.progress.done}/${job.progress.total}`;
    case "failed":
      return "!";
    default:
      return ""; // created, paused, done, cancelled — nothing to flag
  }
}
```

Background (`src/background/index.ts`) calls
`chrome.action.setBadgeText({ tabId: job.tabId, text: badgeTextFor(job) })`
at its existing `broadcast("job/updated", { job })` call site in the
`job/create` handler. No new permission needed — badge APIs are part of
`chrome.action`, already declared via the `action` manifest key. Badge is
scoped per-tab since `JobRecord.tabId` already exists for this purpose.

If `job.tabId` is undefined (job created without an associated tab), skip the
`setBadgeText` call — there's no tab to scope it to.

## Testing

- `badgeTextFor` is a pure function — TDD it directly against `JobRecord`
  fixtures covering each `JobPhase`.
- No new test infra for the merged `PopupApp` JSX: this repo has no React
  Testing Library today, and the popup/side-panel components aren't unit
  tested currently either. Coverage stays at today's level (typecheck + build)
  plus a manual reload-the-unpacked-extension check, which the user will do
  since there's no way to load an unpacked MV3 extension into a browser from
  this environment.

## Out of scope

- The actual download pipeline (job phase transitions beyond `"created"`) is
  step 3 and not built yet. This change only wires the badge to the one
  broadcast point that exists today; future phase-transition code should call
  the same badge update, but that's step 3's responsibility, not this one's.
- Popup layout/styling polish (scrolling long job lists, etc.) — reuse
  `SidePanelApp`'s existing markup as-is, just relocated.
