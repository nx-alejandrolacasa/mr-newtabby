# Hidden empty bar, glass tint slider, and bookmark management

> Three settings-and-bar changes: hide the bookmarks bar when the toolbar is empty (with a one-time notice), replace the fixed glass look with an iOS 27 style clear-to-tinted slider, and let users rename or delete bookmarks and folders from the new tab page via a right-click menu with confirmations.

**Status:** Built · **Date:** 2026-11-02 · **Scope:** shared + both platform shims

## What changes

1. **Empty toolbar hides the bar.** With no bookmarks the bar gets `.empty` and CSS drops it, unless the tab-groups folder is rendered inside it (`:not(:has(.tab-groups-folder))`). A glass notice at the top explains why, with a ✕ that persists `emptyBarNoticeDismissed` so it shows once.
2. **Glass tint slider.** A `glassLevel` setting (seven stops 0–6, default 3, with `<datalist>` tick marks; the clock-size slider got the same seven-stop treatment, 80–140 in tens) sits directly under the Style selector and only unfolds while Style is Glass, reusing the clock-size slider's reveal. It writes `--glass-level` on `<html>` (mirrored to localStorage for theme-init). The glass tokens are now `calc()` expressions of that variable: tint opacity, blur radius and saturation move together, and the specular rim brightens as the glass clears. This mirrors iOS 27, which replaced the iOS 26.1 Clear/Tinted toggle with a Settings slider. The clock digits are glass too: the white tint is clipped to the glyphs (`background-clip: text`) with a top specular edge and the bar's soft shadow, so the slider takes it from ghostly to near-solid. It stays white in dark theme, since a dark-tinted clock disappears on a dark wallpaper. Classic keeps the plain white clock. For real frosting inside the glyphs the clock is drawn on a canvas by `clock.ts`: the wallpaper region behind the clock (same cover/center mapping as the body background) is drawn with the glass blur as a canvas filter, kept only inside the digits via `destination-in` text, then the sheen gradient is painted on top. A light top edge, dark bottom edge and the bar's soft shadow are CSS drop-shadows on the canvas. The renderer re-runs on attribute changes to `<html>`/`<body>` (tint, size, style, wallpaper), resize and font load. An SVG-mask + backdrop-filter attempt was dropped: Firefox applied the mask but not the blur. Note that WebDriver-driven Firefox renders no CSS backdrop-filter at all, but canvas blur does render there, so this one could be verified.
3. **Rename / delete from the bar.** Right-click (or Shift+F10) on a bookmark or folder anywhere in the bar, dropdowns or overflow menu opens a two-item menu: Rename… and Delete…. Both go through a native `<dialog>`: rename pre-fills the title; delete states what goes away and, for folders, counts nested bookmarks and folders. Writes go through new `Platform.bookmarks.rename / remove / removeTree`; the existing `onChanged` listener re-renders. Deleting a folder also clears its emoji.
4. **Content-sized bar.** The glass bar no longer stretches edge to edge: it is `fit-content`, centered, at least 1024px (or the viewport minus margins on narrower windows) and at most the viewport minus margins. The overflow reflow is unchanged: it measures with every item shown, so the bar is at its max width while deciding what to hide, then shrinks to what remains. Classic style keeps its flush, full-width toolbar.
5. **Flat glass, no borders.** Surfaces are a flat tint with the clock's edge treatment: no border, a 1px light line above, a 1px shade below and a soft drop shadow, so they lift off the wallpaper the way the digits do. Tried and dropped as too busy: a top sheen gradient, a lit inset rim, a pointer-tracking highlight, and an outer white ring with halo. SVG displacement refraction was left out: Firefox does not render SVG filters in `backdrop-filter`.
6. **Clock face in Glass.** With Style = Glass the clock uses Shippori Antique B1 (OFL, fetched from the google/fonts repo), subset with fonttools to Basic Latin so the 13 MB Japanese font ships as a few KB. Nothing is ever requested from Google Fonts. All other text keeps Satoshi and the system stack in both styles. Stored glass levels outside the seven stops (from the earlier 0–100 build) reset to the middle.

7. **Adaptive ink.** `wallpaper.ts` owns the wallpaper image (loaded CORS-anonymous; Unsplash sends `Access-Control-Allow-Origin: *`) and a single backdrop-changed signal shared by the clock renderer and `ink.ts`. The latter downsamples the wallpaper to 64×40, averages WCAG luminance under each surface (bar, settings panel, attribution, settings button, empty notice, clock, plus the whole viewport for body-level glass), composites it with the glass tint alpha, and picks light or dark ink with a little hysteresis. Each surface gets `data-ink`; CSS ink tokens (text, hover, controls, toggles) key off it. The clock is not inked: its glass is white in the light theme and smoked in the dark theme, regardless of wallpaper. Classic clears the attributes. Without a readable image the body background colour (Unsplash's dominant colour) is the fallback.

## Decisions

> **✓ Right-click menu, not an "Edit bookmarks" overlay** — zero new navigation; the browser's own context menu is replaced only on bookmark elements, everything else keeps the native one.

> **✓ Native `<dialog>`** — gives the focus trap, Escape and backdrop for free.

> **✓ Rename edits the title only** — URL editing is left to the browser's bookmark manager.

> **✓ One slider, CSS does the mapping** — no JS colour math; `calc()` in `rgb()` alpha and `blur()` is supported by the minimum browsers the manifests target.

## Verification

- `npm run typecheck` and `npm run build` pass for Firefox and Chrome.
- Load unpacked, empty the toolbar: bar disappears, notice shows, ✕ hides it for good; add a bookmark and the bar returns.
- Drag the tint slider: live preview, persists, hidden under Classic.
- Right-click a bookmark, a top-level folder, a nested folder and an overflow item: rename and delete each, confirm counts in the folder dialog.
