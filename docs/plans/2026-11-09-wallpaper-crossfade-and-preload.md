# Wallpaper crossfade and preload

> The next wallpaper is chosen and downloaded ahead of time, so a new tab that is due for a change opens straight on the new image. Any swap that does happen on screen (first paint, "refresh now", the interval expiring while a tab is open) is a crossfade over a colour that eases along with it, instead of the old image vanishing, the colour jumping and the new image popping in.

**Status:** Built · **Date:** 2026-11-09 · **Scope:** shared (`unsplash.ts`, `wallpaper.ts`, `theme-init.ts`, `newtab.css`); no platform shim changes

## Today

`loadBackground` paints the cached photo as `body { background-image }`, then, if the interval has expired, calls Unsplash, waits for the image and paints that one the same way. The swap is a single style write: the old image disappears, `background-color` jumps to the new midtone, and the new image appears once the compositor has it. The `transition: background-image 0.4s` on `body` does nothing, since `background-image` is not animatable. The wallpaper is also fetched twice per tab, once by the CSS background and once by `loadImage` (CORS-anonymous, for pixel sampling), because the two requests do not share a cache entry.

## What changes

1. **A wallpaper layer instead of a body background.** A fixed, full-viewport `#wallpaper` element holds the photo as an `<img>` with `object-fit: cover`. The `img` that `loadImage` already fetches for colour sampling is the one shown, so the double download goes away and `getWallpaper()` simply returns the displayed element. `body` keeps its `background-color` as the base the glass tints against and as the colour under the image while it loads.
2. **Crossfade.** A change appends the new `<img>` at opacity 0 above the old one, transitions it to 1 over about 600 ms, and removes the old one on `transitionend`. `body { transition: background-color }` with the same duration carries the midtone along. The first paint of a tab uses the same path, so the photo fades up from the colour rather than popping. `prefers-reduced-motion` already zeroes every transition, so it degrades to an instant swap.
3. **Preload the next photo.** After the current wallpaper is on screen, if the interval will expire before the next likely tab and no `nextBackground` is stored, the page picks the next photo, downloads it (which warms the HTTP cache; Unsplash serves images with a ten-year `max-age`), computes its midtone, and stores it as `nextBackground`. When a tab opens past the expiry it promotes `nextBackground` to `cachedBackground` and shows it directly, with no API call on the critical path and no on-screen swap. If the stored next is missing or fails to load, the current behaviour remains: show the old, fetch, crossfade.
4. **No colour flash on promotion.** `theme-init.js` paints `backgroundColor` from `localStorage` before the stylesheet. Preloading also writes `nextBackgroundColor` and `rotateAt`; when `Date.now() >= rotateAt`, theme-init paints the next colour instead, so the base colour matches the photo that is about to appear.

## Decisions

> **✓ Preload from the new-tab page, not the background script** — the page already owns the Unsplash flow and runs often enough; a background alarm would add a second code path and the Chrome service worker lifetime to reason about. One API call per rotation, as today.

> **✓ HTTP cache as the image store** — storing image bytes in `storage.local` or IndexedDB means another half-megabyte write per rotation for a case the HTTP cache already covers. If the cached image is evicted, the swap waits for the load and crossfades, so nothing abrupt happens either way.

> **✓ `<img>` rather than two CSS background layers** — it removes the duplicate request and the `backgroundImage` string parsing in `wallpaper.ts`, and `object-fit: cover` on a fixed element is the same geometry `coverRect` computes today.

> **✗ Ken Burns or slide transitions** — a crossfade is the quiet default; motion on a page that opens dozens of times a day gets tiring.

## Later decisions

> **2026-11-09 · A tab's first wallpaper shows at once when it comes from cache.** Fading every tab up from the colour made the usual case, an unchanged cached photo, 600 ms slower than the old CSS background. The first wallpaper a tab shows now appears instantly if it loaded within 150 ms. A slower first load still fades up from the colour, and every later change (rotation, toggling the wallpaper back on) crossfades. Supersedes the last sentence of item 2.

> **2026-11-09 · The old image stays opaque under the new one.** Fading both at once let the body colour show through mid-fade, about a quarter of the picture at the midpoint. The new image fades in above the old one, which is removed after the fade. Only turning the wallpaper off fades the image out. Adds to item 2.

> **2026-11-09 · theme-init starts the wallpaper download.** The URL of the photo on screen is mirrored to `localStorage`, next to its colour. theme-init starts a CORS-anonymous image load from it before the stylesheet, and the page adopts that element. The download then overlaps script parsing and the two extension storage reads. When the rotation is due, theme-init loads the next photo's URL instead. Images are decoded with `img.decode()` before they are shown or sampled. Adds to items 1 and 4.

> **2026-11-09 · One tab talks to Unsplash at a time.** Preloads and on-screen fetches run under a Web Lock taken with `ifAvailable`, and a preload re-reads storage inside it. Tabs opened together after a rotation make one API call between them. Promoting the stored next photo shows it in every tab, but only the first tab saves it and sends the download ping. API requests time out after 15 s so a hung request cannot hold the lock. Adds to item 3.

> **2026-11-09 · Preloads wait, verify and fail quietly.** A preload starts after the visible wallpaper has loaded, in idle time. A tab promotes the stored next photo only once its image has loaded, and otherwise keeps the current one and fetches as before. The width a photo was downloaded at is stored with it, and reused on screens that need no more, so the HTTP cache hits after moving between monitors. Preload failures back off on their own `preloadBackoff` key, so the settings error only reflects the wallpaper on screen. Adds to item 3.

> **2026-11-09 · Turning the wallpaper off clears the rotation hints.** Otherwise theme-init kept painting the preloaded photo's colour after the rotation time, and the page then transitioned it back on every new tab. Ink also re-runs when the body colour transition ends, since it reads the computed colour. Adds to item 4.

> **2026-11-09 · theme-init puts the wallpaper on screen.** The early download alone did not help: the page still added the photo only after its extension storage reads, which take hundreds of milliseconds on a cold tab, so the colour showed first. theme-init now adds its early image to the wallpaper layer as soon as it is decoded, and the page treats it as the photo on screen. It appears at once if it is ready before the first frame. If the colour has already been painted it fades in, and a first wallpaper shown by the page always fades. If the stored record names a different photo, the page crossfades to it as usual. Supersedes the entry above on cached first wallpapers.

> **2026-11-09 · The old image is removed when the new one's fade ends.** A timer could remove it before the fade finished when frames stall, as they do in hidden tabs, leaving the colour showing. Adds to the entry on keeping the old image opaque.

## Verification

- Open a tab with an expired interval and a stored next: the new photo and its colour are there on first paint, no swap visible, no Unsplash API request in the network panel.
- Open a tab with an expired interval and no stored next: old photo first, then a 600 ms crossfade with the colour easing alongside.
- "Refresh now" in settings crossfades.
- Resource timing shows one request for the wallpaper per tab, not two.
- Ink and the glass clock still sample the displayed image (dark photo gives light ink, and the clock glyphs show the blurred photo).
- With reduced motion enabled the swap is instant.
