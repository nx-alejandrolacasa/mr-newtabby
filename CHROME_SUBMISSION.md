# Chrome Web Store submission — dashboard form fields

Text to paste into the **Privacy** and **Distribution** tabs of the chrome.google.com/webstore/devconsole submission form, in addition to the listing copy in [`LISTING_CHROME.md`](./LISTING_CHROME.md).

## Single purpose

> One sentence. CWS reviewers check that every permission ties back to this.

```
Replace the new tab page with the user's bookmarks toolbar laid out as a pill at the top of the tab, over an optional curated wallpaper from Unsplash — and, optionally, let the user reopen their browser tab groups from that same bar.
```

## Permission justifications

Paste one line per permission into the corresponding field in the dashboard. Each line answers "Why does your extension need this permission?"

### `bookmarks`

```
Reads the user's bookmarks (specifically the Bookmarks Bar / Toolbar folder) to render them as the primary UI element on the new tab page. The extension never modifies, deletes, transmits, or otherwise writes bookmarks — it only reads them via chrome.bookmarks.getTree().
```

### `storage`

```
Persists user preferences (theme, "Glass" vs "Classic" style, "center bookmarks", per-folder emojis, "show background image", wallpaper refresh interval) and a small wallpaper metadata cache (photo URL, photographer attribution, color, fetched-at timestamp) using chrome.storage.local. All data stays on the user's device.
```

### `search`

```
Powers the search box on the new tab page by submitting the query to the user's default search engine via chrome.search.query(). The extension does not log, store, or transmit search queries anywhere else.
```

### `favicon`

```
Reads favicons for bookmarked sites from Chrome's local favicon cache via the chrome-extension://{id}/_favicon/?pageUrl=... URL scheme. This avoids making network requests for icons the browser has already cached. If the cache has no icon, the extension falls back to the bookmarked site's own /favicon.ico (no third-party favicon services are used).
```

### `tabs` (optional)

```
Optional permission — listed in optional_permissions and requested only when the user turns on "Tab groups" in Settings (off by default). It reads the titles and URLs of tabs that belong to a tab group so the group can be saved locally and reopened later from the new tab page, and it is used to open those URLs when the user clicks to reopen a group. Tab data is stored only in chrome.storage.local and is never transmitted.
```

### `tabGroups` (optional)

```
Optional permission — requested together with "tabs" only when the user enables "Tab groups". It reads a tab group's name and color (chrome.tabGroups) to snapshot it, and re-creates a group (chrome.tabs.group + chrome.tabGroups.update) when the user reopens one. The extension never transmits this data.
```

### Host permission: `https://api.unsplash.com/*`

```
Fetches a random wallpaper photo from Unsplash's curated wallpaper collection (collection ID 1053828) when the user enables "Show background image" (default on). Requests are limited to api.unsplash.com/photos/random and api.unsplash.com/photos/{id}/download (the latter is the tracking ping required by Unsplash's API guidelines, one per fresh fetch). All requests carry only a Client-ID application key — never any user identifier. With the default 6-hour refresh interval, this is at most a handful of requests per day.
```

## Remote code

> CWS field: "Are you using remote code?" — Choose **No**.

```
No. All JavaScript and CSS executed by the extension is bundled inside the extension package at build time (esbuild, IIFE bundle). No eval, no Function() construction from strings, no <script src> injection, no WebAssembly fetched at runtime. The extension does not load HTML, JS, or CSS from any remote source. Images fetched from images.unsplash.com are loaded into <img> elements only and are not interpreted as code.
```

## Data usage disclosure

> CWS field: "What user data does your extension collect or use?" — Tick only the categories that actually apply. Mr. Newtabby transmits no user data, but the optional **Tab groups** feature *reads* tab URLs locally, which Google may classify as **"Website content."** Decision to confirm before submitting: if you treat reading-but-not-transmitting as in-scope (the conservative reading), tick **Website content** and rely on the certifications below (used only for the single purpose, never sold/transferred); otherwise, with the feature being off by default and entirely on-device, all categories may be left unchecked. Either way the rationale below applies.

Rationale for the reviewer (paste in the "Additional details" field if prompted):

```
Mr. Newtabby does not transmit any user-identifying data. The extension reads the user's bookmarks locally and renders them on the new tab page; bookmarks are never sent to any server. The only outbound HTTP destination is api.unsplash.com (when "Show background image" is on), which receives a Client-ID application key and — as an unavoidable consequence of any HTTP request — the user's IP address. No user identifier is constructed or sent. No analytics, telemetry, or crash reporting. All settings are stored on-device via chrome.storage.local.

The optional "Tab groups" feature (off by default; requests the tabs and tabGroups permissions only when the user enables it) reads open tab groups — their names, colors, and member tab URLs — solely to save them on the device so the user can reopen a closed group from the new tab page. This data is stored in chrome.storage.local and is never transmitted, sold, or shared.
```

## Data usage certifications

> CWS displays three required checkboxes near the data-usage form. Tick all three:

- [x] **I do not sell or transfer user data to third parties** apart from the approved use cases.
- [x] **I do not use or transfer user data for purposes unrelated to my item's single purpose.**
- [x] **I do not use or transfer user data to determine creditworthiness or for lending purposes.**

## Privacy policy URL

```
https://github.com/nx-alejandrolacasa/mr-newtabby/blob/main/PRIVACY.md
```

## Notes for reviewer

> Paste into the "Justification" / "Testing instructions" field on submission.

```
Mr. Newtabby replaces the new tab page with the user's Bookmarks Bar laid out as a pill at the top, over an optional Unsplash wallpaper.

About this version (1.13.0): new extension icon and a matching favicon on the new tab page. Functionality, permissions, and data handling are identical to 1.12.0. The store icon is rasterized from the SVG at build time by a small dependency-free script in the repo (packages/shared/src/build-helpers/icon-png.ts).

To test:
1. Install the unpacked extension or the uploaded package.
2. Open a new tab — you should see the bookmarks pill at the top.
3. If you don't have anything on the Bookmarks Bar, add a couple of bookmarks to it (Bookmarks → Bookmarks Bar) and reload the new tab; the pill updates immediately.
4. Click the gear icon (bottom-right) to access settings: theme, Glass vs Classic style, refresh interval, and the "Show background image" toggle.

Network behavior:
- The only outbound network destination is api.unsplash.com (and images.unsplash.com for image loads), used to fetch a random photo from Unsplash's curated wallpaper collection 1053828. Disabling "Show background image" stops all requests.
- Favicons are loaded via Chrome's internal _favicon/ URL scheme first (no network), falling back to the bookmarked site's own /favicon.ico when the cache has no entry. No third-party favicon services are used.

Build notes:
- Source: https://github.com/nx-alejandrolacasa/mr-newtabby (MIT license)
- The shipped bundle embeds only the public Unsplash Access Key (Client-ID), per Unsplash's API guidelines for client-side apps.
- No analytics, telemetry, crash reporting, content scripts, or remote code. Bookmarks data never leaves the browser.
```

## Distribution settings

- **Visibility**: Public
- **Distribution**: All regions (or restrict as needed; the extension has no region-specific behavior)
- **Pricing**: Free

## Post-submission checklist

- [ ] Listing language matches `LISTING_CHROME.md` (summary ≤ 132 chars, description pasted as plain text)
- [ ] Privacy practices tab green-checked (all three certifications ticked, privacy policy URL present)
- [ ] Single purpose statement matches the one above
- [ ] All requested permissions have justifications
- [ ] Screenshots uploaded (1280×800 or 640×400, at least one)
- [ ] Store icon = 128×128 PNG (auto-uses `icons.128` from manifest, but the listing slot is separate — upload `packages/shared/assets/icons/icon.png` there too)
- [ ] Package uploaded: `web-ext-artifacts/mr-newtabby-chrome-v1.13.0.zip`
- [ ] "Why are you requesting these permissions?" field non-empty for every permission
