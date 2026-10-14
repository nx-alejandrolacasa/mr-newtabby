# Firefox listing copy

Text to paste into the addons.mozilla.org submission form. Keep this in sync with the actual extension behavior.

## Summary

> 250-character limit. Current: 199 chars.

```
Floats your bookmarks toolbar at the top of every new tab, over a curated rotating wallpaper from Unsplash. Glass or Classic style, light/dark themes, 7 languages. No tracking, no analytics.
```

## Description

> Markdown is supported (basic). Paste into the AMO description field.

```markdown
**Mr. Newtabby** (formerly Topmarks) floats your Firefox bookmarks toolbar at the top of every new tab, over a rotating wallpaper from Unsplash. Designed to be minimal, fast, and unobtrusive.

**Features**

- **Bookmarks where you want them.** Your Bookmarks Toolbar appears as a clean pill at the top of every new tab. Folders open as dropdowns; nested folders cascade as side menus.
- **Reopen your tab groups.** Mr. Newtabby remembers the browser tab groups you've opened and lists the closed ones in the bookmarks bar — click one to reopen the whole group in a tab. Opt-in: turn it on in Settings (it requests the tabs and tab-groups permissions only then), and your groups are saved on your device, never uploaded.
- **Folders with personality.** Replace any top-level folder's icon with an emoji — just paste one from your system picker. Clear it anytime to restore the default.
- **Curated wallpapers.** Each session loads a high-resolution photo from a curated Unsplash collection, sized to your display (up to 4K). Pick a refresh interval: every 1, 6, 12, or 24 hours.
- **Two styles.** Pick **Glass** for a frosted-glass aesthetic with backdrop blur, or **Classic** for solid surfaces and a flush-anchored bar.
- **Light, Dark, or Auto.** Follows your system theme or whatever you choose.
- **7 languages.** English, Spanish, French, Italian, German, Japanese, and Simplified Chinese — auto-detects your Firefox UI language.
- **Accessibility-aware.** Respects prefers-reduced-motion and prefers-reduced-transparency. Folder dropdowns are keyboard-navigable with proper ARIA semantics.

**Privacy**

Mr. Newtabby does **not** collect, transmit, or store your bookmarks, browsing history, or any personal identifier. The only outbound network request is to api.unsplash.com when wallpapers are enabled, to fetch a random photo. Favicons come from icons your browser has already seen (remembered locally from your open tabs) with a fallback to each bookmarked site's own /favicon.ico — no third-party favicon services. When the optional **Tab groups** feature is enabled, Mr. Newtabby reads your tab groups (their names, colors, and member tab URLs) to save them on your device for one-click reopening — this stays in local storage and is never transmitted. No analytics. No telemetry. No remote code.

Full privacy policy: https://github.com/nx-alejandrolacasa/mr-newtabby/blob/main/PRIVACY.md

**Source & license**

Open source under the MIT License.

GitHub: https://github.com/nx-alejandrolacasa/mr-newtabby

Photos courtesy of Unsplash.
```

## Categories

- New Tab Page
- Appearance

## Tags

`bookmarks`, `new tab`, `wallpaper`, `unsplash`, `minimal`

## Notes for reviewer

> Paste into AMO's "Notes for reviewer" field on submission.

```
This extension reads bookmarks via the bookmarks API and renders the
toolbar on the new tab page. The only network destination is
api.unsplash.com (when "Show background image" is enabled), used to
fetch a random photo from Unsplash's curated wallpaper collection
1053828.

About this version (1.13.0): new add-on icon and a matching favicon on
the new tab page. Functionality, permissions, and data handling are
identical to 1.12.0.

Build: npm install && npm run build (esbuild monorepo; see README).
The public Unsplash Access Key (Client-ID) is read from .env at build
time and embedded into the bundle, per Unsplash's API guidelines for
client-side apps — it is the only value injected into the source.

Favicons: Firefox does not expose its favicon cache to extensions
(the page-icon: scheme is chrome-privileged), so while the optional
"tabs" permission is granted the extension remembers the favicon URLs
of tabs the user opens (tabs.favIconUrl, keyed by site origin, stored
in storage.local) and uses them for the bookmarks bar, falling back to
the bookmarked site's own /favicon.ico. No third-party favicon
services are used and the cache never leaves the device.

The optional "Tab groups" feature (off by default) requests the
"tabs" and "tabGroups" permissions only when the user enables it in
Settings. It reads open tab groups (names, colors, and member tab
URLs) to snapshot them in local storage so closed groups can be
reopened from the new tab page, and re-creates a group via tabs.group
when one is reopened. The "tabs" grant also powers the favicon cache
described above. This data is stored only on the device and is never
transmitted.

No analytics, telemetry, or crash reporting. No remote code. No
content scripts. Bookmarks data never leaves the browser.
```

## Source code submission

> AMO asks "Do you use any of the following in your extension?" — answer **Yes** (esbuild bundles multiple files into one). Upload a source zip generated from the release tag: `git archive --format=zip -o web-ext-artifacts/mr-newtabby-<version>-source.zip v<version>`. Paste the following into the source-submission notes field:

```
Requirements: Node.js 22.x (ships with npm 10). Any OS.

1. Unzip the source archive and cd into it.
2. npm install
3. Create a .env file at the repo root with one line:
   UNSPLASH_ACCESS_KEY=<the public Unsplash Client-ID — the same value
   visible in the uploaded newtab.js bundle's Authorization header>
   (Without .env the build still succeeds; the only difference in output
   is that the embedded key string is empty.)
4. npm run build

The Firefox package is produced at packages/firefox/dist/ and matches
the uploaded zip: esbuild IIFE bundles, unminified, with inline source
maps. No other code generation or templating is involved.
```

## Release notes

> Paste the latest entry into the version's "Release notes" / "What's new" field. Newest first.

### v1.13.0

```
A new icon: Mount Fuji, snow cap included. The new tab page now also shows a matching favicon in the tab strip that follows your browser's light or dark theme. Nothing else changed.
```

### v1.12.0

```
Topmarks is now Mr. Newtabby. New name, new icon, same add-on — your bookmarks, settings, and saved tab groups carry over untouched, and updates keep arriving automatically.
```

### v1.11.0

```
Bookmark favicons now actually load on Firefox: icons are remembered locally from the tabs you open (no network, no third-party services) instead of relying on a favicon cache Firefox doesn't expose to extensions. Plus a friendlier Groups menu — forgetting a saved group is now a direct two-click action instead of a submenu, and Topmarks detects and lets you re-grant the tab permissions if the browser has dropped them.
```

### v1.10.0

```
New: Tab groups. Reopen your closed browser tab groups straight from the bookmarks bar. Fully opt-in — Topmarks requests the tabs and tab-groups permissions only when you enable the feature in Settings, and your groups are saved locally, never uploaded.
```
