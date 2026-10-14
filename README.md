# Mr. Newtabby

[**Website**](https://nx-alejandrolacasa.github.io/mr-newtabby/) · [Install for Firefox](https://addons.mozilla.org/firefox/addon/topmarks/)

Formerly Topmarks. A minimal new-tab extension for Firefox and Chrome that floats your bookmarks toolbar at the top of every new tab, over a rotating Unsplash wallpaper.

## Features

- Floating glass bookmarks bar with folder dropdowns and nested submenus
- Reopen closed browser tab groups from the bookmarks bar (opt-in; requests `tabs` + `tabGroups` only when enabled, snapshots stay on-device)
- Replace any top-level folder's icon with an emoji of your choice
- Rotating high-resolution wallpapers from Unsplash's curated wallpaper collection
- Light / Dark / Auto theme
- Configurable background refresh interval (1h / 6h / 12h / 24h)
- 7 languages: English, Spanish, French, Italian, German, Japanese, Chinese (Simplified)
- Liquid-glass aesthetic with backdrop blur, inspired by iOS 26
- Respects `prefers-reduced-motion` and `prefers-reduced-transparency`
- Privacy-respecting: no analytics, no third-party trackers, bookmarks never leave your device

Both builds are Manifest V3 and share a single TypeScript source tree under `packages/shared`.

## Setup

1. Get an Unsplash Access Key at <https://unsplash.com/oauth/applications>. Only the **Access Key** is needed — the Secret Key must never be placed in client-side code.
2. Configure:

   ```sh
   cp .env.example .env
   # paste your UNSPLASH_ACCESS_KEY into .env
   npm install
   ```

   The key is read at build time and stamped into the bundle. Re-run `npm run build` after editing `.env`.

## Build

```sh
npm run build              # builds both packages
npm run build:firefox      # → packages/firefox/dist
npm run build:chrome       # → packages/chrome/dist
```

## Install in Firefox (development)

1. Run `npm run build:firefox` (or `npm run dev:firefox` for watch + auto-reload).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Pick `packages/firefox/dist/manifest.json`.
5. Open a new tab.

Temporary add-ons are removed when Firefox restarts. For a persistent install, the extension needs to be signed via [addons.mozilla.org](https://addons.mozilla.org), or run Firefox Developer Edition with `xpinstall.signatures.required` set to `false` in `about:config`.

## Install in Chrome (development)

1. Run `npm run build:chrome` (or `npm run dev:chrome` for watch + auto-reload).
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and pick `packages/chrome/dist/`.
5. Open a new tab.

## Configuration

Click the gear icon at the bottom-right of the new tab page:

- **Center bookmarks in bar** — center-align instead of left-aligning
- **Hide labels** — icons-only bar: folder icon/emoji + caret for folders, favicon for links
- **Folder emojis** — open the overlay and paste an emoji to replace any top-level folder's icon (clear it to restore the default)
- **Show background image** — toggle Unsplash wallpaper on/off
- **Show search field** — toggle the search input above the bookmarks bar
- **Theme** — Auto / Light / Dark
- **Refresh background every** — 1h / 6h / 12h / 24h

Settings persist in the browser's extension storage and are wiped on uninstall.

## Privacy

The extension does not collect, transmit, or store your bookmarks, browsing history, or any personal identifier. When backgrounds are enabled, the extension makes HTTPS requests to `api.unsplash.com` for a random wallpaper. Favicons come from icons the browser has already seen — Chrome's own favicon cache (`_favicon/`), or on Firefox icons remembered locally from your open tabs — with a fallback to each bookmarked site's own `/favicon.ico`. No third-party favicon services.

Full policy: [PRIVACY.md](./PRIVACY.md).

## Project structure

```
packages/
  shared/                Shared runtime (TypeScript), styles, locales, assets
    src/                 newtab entry, bookmarks, settings, background, search
    assets/              icons, fonts, newtab.html, newtab.css
    _locales/            translations (en, es, fr, it, de, ja, zh_CN)
  firefox/               Firefox MV3 package
    src/platform.ts      browser.* shim implementing the shared Platform interface
    manifest.json        Firefox manifest
    build.ts             esbuild + asset copy + manifest version stamp
    dist/                build output (loaded as Temporary Add-on)
  chrome/                Chrome MV3 package
    src/platform.ts      chrome.* shim implementing the shared Platform interface
    manifest.json        Chrome manifest
    build.ts             esbuild + asset copy + manifest version stamp
    dist/                build output (loaded as Unpacked Extension)
.env.example             Template — copy to .env, fill in, gitignored
PRIVACY.md               Privacy policy
```

The shared package owns all UI and behavior. Each browser package provides only a thin `platform.ts` adapter that wraps `browser.*` or `chrome.*` APIs to match a shared `Platform` interface, plus its own manifest and build entry point.

## Development

- **Watch + reload**: `npm run dev:firefox` or `npm run dev:chrome` rebuilds on file change and launches the browser with the extension preloaded (`web-ext run`).
- **Manual reload**: in `about:debugging` (Firefox) or `chrome://extensions` (Chrome), click **Reload** on the extension after running `npm run build`.
- **Typecheck**: `npm run typecheck` (uses `tsc -b` across all packages).
- **Lint**: `npm run lint` (runs `web-ext lint` against both `dist/`s).
- **Re-run** `npm run build` after editing `.env`.

The new-tab page's favicon (`packages/shared/assets/icons/favicon.svg`) is the
icon's glyph without the background, dark or white to follow the browser's
light or dark mode through a `prefers-color-scheme` media query inside the
SVG. Chrome's store PNG is rendered from the SVG design at build time
(`packages/shared/src/build-helpers/icon-png.ts`);
`node --experimental-strip-types scripts/generate-icon.mjs` writes the same
PNG to `packages/shared/assets/icons/icon.png` for the store listing.

## Credits

- [Unsplash](https://unsplash.com) — photo API and the curated wallpaper collection.
- [Tabliss](https://github.com/joelshepherd/tabliss) — collection ID and the screen-aware image-sizing approach (snap to 240px increments, clamp 1920–3840px).

## License

Released under the [MIT License](./LICENSE).
