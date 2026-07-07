# Ranobes fixtures

Real, saved HTML from ranobes.top, used so adapter tests fail loudly when the
site's markup changes instead of silently producing broken extraction.

- `novel-page.html` — novel landing page for "Radiant Blade of the Wilderness"
  (`/novels/1207185-the-sword-illuminates-the-great-wilderness.html`), saved 2026-07-07.
  Contains: title, cover (both highslide anchor and figure background-image
  forms), author, description, and an embedded "last 25 chapters" list
  (not the full paginated TOC — see below).
- `chapter-page.html` — chapter content page, "Chapter 74: Frostshade"
  (`/the-sword-illuminates-the-great-wilderness-1207185/3219072.html`), saved 2026-07-07.
  Contains: `h1.title` chapter heading (no `og:title` on this page type, unlike
  the novel page), and `div#arrticle` story body — plain `<p>`/`<i>` formatting
  with ad `<script>` tags and `#bg-ssp-*`/`.free-support-top` `<div>`s injected
  mid-paragraph by the ad network, which `extractChapter`'s sanitiser strips.

## Still needed for full adapter completion (step 2 continued)

- A saved **table of contents** page: `/chapters/1207185/` — needed to
  confirm pagination shape and whether the full chapter list is embedded as
  JSON (as on many DLE-engine sites) or requires DOM scraping across pages.
  This is the only piece left before `getChapterList` can be implemented.
