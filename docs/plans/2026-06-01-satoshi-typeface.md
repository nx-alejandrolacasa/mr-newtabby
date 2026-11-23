# Satoshi as a display accent

> Use **Satoshi** — a geometric grotesque with personality — on the page's
> **display elements**: the big **clock** (its loudest moment), the **search
> pill**, and the **settings heading**. Body and UI text stay on the system sans
> for crispness at 13px. Cookie stays as the script accent.

**Status:** Built · **Date:** 2026-06-01 · **Scope:** shared · both stores

## What changes

1. Satoshi is applied to three **display** elements via a shared `--font-display` token: the **clock**, the **search pill** (`#search-input`), and the settings **heading** (`#settings-panel h2`). The system stack is the fallback (swap, no FOIT, no layout break if the font fails).
2. **Body and all other UI text** stay on the system sans — Satoshi did not read well as the workhorse at the 13px body size, and the accent gives the personality without that cost.
3. The **clock** sits at weight **500 (Medium)** — the initial 900 read too heavy — and gets a user-adjustable size (see the size-slider note below). This replaces the center-widget plan's “bold system sans”.
4. The **Cookie** script font is untouched — it stays on the `.bmc-link` / brand accent.
5. No visible typeface setting; scope is one line (the `--font-display` token) to widen or narrow later.

## Why / context

The page already self-hosts one bundled font (Cookie) the canonical way: a
`@font-face` in `newtab.css`, a `<link rel="preload">` in `newtab.html`, and a
recursive copy of `assets/fonts/` into each store's `dist/` at build time.
Satoshi rides the exact same rails — no new build machinery, no remote fetch
(which extension CSP forbids and which would leak a request per new tab).

Satoshi ships as a single **variable** file carrying the whole weight axis
(`300–900`), so whatever weight an accent lands on (the clock settled at `500`)
comes from that one file — the minimum footprint is literally one `.ttf`. The
other 12 family files that were pasted in have been removed.

## Approach

| File | Change |
|------|--------|
| `packages/shared/assets/fonts/Satoshi-Variable.ttf` _(new)_ | The single bundled Satoshi file (variable, `wght 300–900`, ~124 KB). Already in place; the 12 redundant static/italic files have been deleted. |
| `packages/shared/assets/newtab.css` | Add a `@font-face` for `"Satoshi"` pointing at the variable file with `font-weight: 300 900` and `font-display: swap`. Define a `--font-display` token (Satoshi + system fallback) and apply it to `#clock`, `#search-input`, and `#settings-panel h2`. Body stays system sans. Clock weight set to `500`. |
| `packages/shared/assets/newtab.html` | Add `<link rel="preload" href="fonts/Satoshi-Variable.ttf" as="font" type="font/ttf" crossorigin>` next to the existing Cookie preload — the clock is the default widget and shows above the fold, so warming the font avoids a swap flash on it. |
| `packages/chrome/build.ts`<br>`packages/firefox/build.ts` | Add `"fonts/Satoshi-Variable.ttf"` to each `REQUIRED_DIST_FILES` list so `validateDist()` fails loudly if it ever stops shipping. The recursive `fonts/` copy already carries the file into `dist/` — no copy-logic change needed. |

```
build copies assets/fonts/ → @font-face "Satoshi" (300–900) → preload warms it → --font-display token → applied to #clock (500), #search-input, #settings h2 · body stays system sans
```

## Later decisions

> **2026-11-23 · Bundled fonts block instead of swapping, and all three are preloaded.** With `font-display: swap` a cold tab painted the clock in the system font and then swapped, even though the files are local, because reading and decoding them still takes a few frames. Cookie, Satoshi and Shippori Antique B1 now use `font-display: block`, and Shippori gets a preload next to the other two. Text in those faces stays invisible for the moment the font takes to load, then appears once. Supersedes the "swap, no FOIT" fallback in item 1.

## Verification

- `npm run build` both packages — `validateDist` confirms the font ships; type-check is unaffected.
- Load unpacked: the clock, search pill, and settings heading render in Satoshi; body/UI text is system sans; Cookie still on the brand link.
- Throttle/deny the font once → accents fall back to system sans cleanly (swap, no invisible text, no layout jump).
- Glass + Classic, light + dark, all legible over a wallpaper.

---

## Decisions

> **✓ Display accent, not the workhorse** — tried Satoshi on the whole UI; it didn't read as well as the system sans at the 13px body size. Scoped to display elements (clock, search pill, settings heading) via `--font-display` — personality where it counts, system crispness everywhere else.

> **✓ One variable file — the minimum** — `Satoshi-Variable.ttf` alone spans the whole weight axis the accents need. The 12 static + italic files were removed.

> **✓ Clock at weight 500** — 900 then 700 read too heavy; 500 (Medium) is the settled weight. Overrides the center-widget plan's “bold system sans” note.

> **✓ Keep Cookie** — the script accent on `.bmc-link` stays — Cookie the flourish, Satoshi the display face, system sans the body.

> **✓ Upright only, no italic file** — no display accent uses italic, so only the upright variable ships — no need for the ~130 KB variable-italic file.

> **✓ TTF, matching Cookie** — consistent with the existing self-hosted font and with what was provided. See the open item on woff2.

## Open items

> **? woff2 to shrink the payload** — the variable TTF is ~124 KB; the equivalent woff2 is typically ~40 KB. Fontshare publishes woff2, but it isn't reachable from this sandbox. Optional follow-up: drop in `Satoshi-Variable.woff2` and switch the `src` — smaller download, faster first paint. Not required to ship.

> **? License file** — Satoshi is under the ITF Free Font License (free for commercial use and bundling). Consider committing the license text alongside the font, as is good practice for redistributed fonts.
