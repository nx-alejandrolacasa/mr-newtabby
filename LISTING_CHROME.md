# Chrome Web Store listing copy

Text to paste into the chrome.google.com/webstore/devconsole submission form. Keep this in sync with the actual extension behavior.

CWS rendering note: the description field does **not** support Markdown. Line breaks render, but `**bold**` and `#` headings render as literal characters. Sections below use ALL-CAPS labels so they remain readable when pasted as plain text.

## Name

> 50-character limit. Provided by `_locales/en/messages.json` (`extName`).

```
Mr. Newtabby
```

## Summary

> 132-character limit. Current: 121 chars.

```
Floats your bookmarks toolbar at the top of every new tab, over a rotating Unsplash wallpaper. No tracking, no analytics.
```

## Description

> 16,000-character limit. Paste as plain text — CWS does not render Markdown.

```
Mr. Newtabby (formerly Topmarks) floats your Chrome bookmarks toolbar at the top of every new tab, over a rotating wallpaper from Unsplash. Designed to be minimal, fast, and unobtrusive.

FEATURES

• Bookmarks where you want them. Your Bookmarks Toolbar appears as a clean pill at the top of every new tab. Folders open as dropdowns; nested folders cascade as side menus.

• Reopen your tab groups. Mr. Newtabby remembers the browser tab groups you've opened and lists the closed ones in the bookmarks bar — click one to reopen the whole group. Opt-in: turn it on in Settings (it requests the tabs and tab-groups permissions only then), and your groups are saved on your device, never uploaded.

• Folders with personality. Replace any top-level folder's icon with an emoji — just paste one from your system picker. Clear it anytime to restore the default.

• Curated wallpapers. Each session loads a high-resolution photo from a curated Unsplash collection, sized to your display (up to 4K). Pick a refresh interval: every 1, 6, 12, or 24 hours.

• Two styles. Pick Glass for a frosted-glass aesthetic with backdrop blur, or Classic for solid surfaces and a flush-anchored bar.

• Light, Dark, or Auto. Follows your system theme or whatever you choose.

• 7 languages. English, Spanish, French, Italian, German, Japanese, and Simplified Chinese — auto-detects your Chrome UI language.

• Accessibility-aware. Respects prefers-reduced-motion and prefers-reduced-transparency. Folder dropdowns are keyboard-navigable with proper ARIA semantics.

PRIVACY

Mr. Newtabby does not collect, transmit, or store your bookmarks, browsing history, or any personal identifier. The only outbound network request is to api.unsplash.com when wallpapers are enabled, to fetch a random photo. Favicons load from Chrome's own favicon cache first (no network), then fall back to each bookmarked site's own /favicon.ico — no third-party favicon services. When the optional Tab groups feature is enabled, Mr. Newtabby reads your tab groups (their names, colors, and member tab URLs) to save them on your device for one-click reopening — this stays in local storage and is never transmitted. No analytics. No telemetry. No remote code.

Full privacy policy: https://github.com/nx-alejandrolacasa/mr-newtabby/blob/main/PRIVACY.md

SOURCE AND LICENSE

Open source under the MIT License.

GitHub: https://github.com/nx-alejandrolacasa/mr-newtabby

Photos courtesy of Unsplash.
```

## Category

> CWS allows one primary category.

- **Workflow & Planning** (primary recommendation — new-tab/bookmarks workflow customization)
- Fallback: **Functionality & UI**

## Language

```
English (United States)
```

The extension itself ships translations for 7 locales (en, es, fr, it, de, ja, zh_CN) via `_locales/`, but the CWS listing language field controls the listing copy above, not the extension UI.

## Store icon

`packages/shared/assets/icons/icon.png` (128×128 PNG) — already embedded in the package, also uploaded separately as the store-listing icon.

## Screenshots

CWS requires **exactly 1280×800** or **640×400**. At least one screenshot is required; up to five may be uploaded.

Available in `packages/shared/assets/screenshots/` — all already **1280×800**, so they upload as-is (no resize or crop needed):

| File | Size | What it shows |
|---|---|---|
| `1-glass_light.jpg` | 1280×800 | Glass style, light theme, bookmarks pill at top |
| `2-glass_dark.jpg` | 1280×800 | Glass style, dark theme, bookmarks pill at top |
| `3-classic.jpg` | 1280×800 | Classic style, bookmarks bar flush at bottom |
| `4-glass_bottom.jpg` | 1280×800 | Glass style, bookmarks bar anchored at the bottom |

Suggested additional shots to capture before submission (optional, max 5 total):
- The **Tab groups** menu open in the bar — shows the headline v1.10.0 feature
- Localized UI (Japanese or Spanish) — demonstrates the 7-language support

## Promotional images (optional but recommended)

- **Small promo tile**: 440×280 PNG/JPG — improves visibility in CWS rotations.
- **Marquee promo**: 1400×560 PNG/JPG — only used if the extension is featured.

If we don't have these yet, skip them; they can be added in a later edit without re-review.

## Release notes

> CWS shows version notes on the item's update. Paste the latest entry as plain text. Newest first.

### v1.13.0

```
A new icon: Mount Fuji, snow cap included. The new tab page now also shows a matching favicon in the tab strip that follows your browser's light or dark theme. Nothing else changed.
```

### v1.12.0

```
Topmarks is now Mr. Newtabby. New name, new icon, same extension — your bookmarks, settings, and saved tab groups carry over untouched, and updates keep arriving automatically.
```

### v1.11.0

```
A friendlier Groups menu: forgetting a saved group is now a direct two-click action (click the ✕, then confirm) instead of a submenu, and Topmarks now detects when the browser has dropped the optional tab permissions and offers a one-click re-grant instead of failing silently.
```

### v1.10.0

```
New: Tab groups. Reopen your closed browser tab groups straight from the bookmarks bar. Fully opt-in — Topmarks requests the tabs and tab-groups permissions only when you enable the feature in Settings, and your groups are saved locally, never uploaded.
```
