# Privacy Policy

**Last updated:** 2026-11-23

This policy explains what data the **Mr. Newtabby** (formerly Topmarks) browser extension (the "extension") handles, what is transmitted off your device, and how you can control it. It applies to the version of the extension distributed via [addons.mozilla.org](https://addons.mozilla.org) (Firefox) and the [Chrome Web Store](https://chromewebstore.google.com) (Chrome and Chromium-based browsers), and any source-built copy of the same code.

## 1. Summary

- The extension reads your browser's bookmarks toolbar locally and displays it on every new tab page.
- The extension does **not** collect, transmit, sell, or share your bookmarks, browsing history, or any personal identifier.
- When the optional "Show background image" feature is enabled (default: on), the extension makes HTTPS requests to Unsplash to fetch a random wallpaper photo. These requests transmit your IP address (unavoidable for any HTTP request) but no other personal data.
- When the optional "Tab groups" feature is enabled (default: off), the extension reads your browser tab groups (their names, colors, and member tab URLs) to save them on your device so closed groups can be reopened. This data is stored locally and is never transmitted.
- All settings and cached data are stored only on your device using your browser's local extension storage APIs.

## 2. Data the extension does not collect or transmit

The extension does **not**:

- Send your bookmarks (URLs, titles, folder structure) to any server.
- Transmit your browsing history, page visits, open tabs, or the contents of web pages. (When you enable the optional "Tab groups" feature, the extension *reads* the URLs of tabs that belong to a tab group — see §3 and §5 — but it stores them only on your device and never transmits them.)
- Use analytics, telemetry, crash reporting, or any user-identification mechanism.
- Use cookies or any cross-site tracking technology.
- Sell, rent, lease, share, or disclose data to advertisers, data brokers, or any third party.
- Inject scripts or content into web pages you visit.
- Modify your bookmarks, browsing settings, or any other browser data.

## 3. Data stored locally on your device

The extension uses your browser's extension storage (`browser.storage.local` in Firefox / `chrome.storage.local` in Chrome) `window.localStorage` and IndexedDB to remember:

- **Your settings** — theme (auto/light/dark), "center bookmarks", per-folder emojis, "show background image", and refresh interval.
- **A small cache for the most recent background photo** — its base URL, photographer name, photographer profile link, photo page link, the photo's representative color, and the timestamp it was fetched. The image files of the current photo and the next one in line are kept as well, so a new tab can show them without downloading them again; older ones are deleted, and all of them when you turn the background image off.
- **Tab group snapshots** (only if you enable the optional "Tab groups" feature) — for each group you've opened: its name, color, and the titles and URLs of its member tabs, so a closed group can be reopened from the new tab page. Remove individual entries via the group's "Forget" action, or disable the feature.
- **A favicon cache** (Firefox, only while the optional `tabs` permission from "Tab groups" is granted) — for each site you open, the icon URL your browser already shows in the tab strip, keyed by site origin (capped at 500 entries), so your bookmarks can display their icons. Firefox does not expose its own favicon cache to extensions.

This data is stored only on your device. It is not synchronized to your Firefox Account, Google Account, or any other cloud profile by the extension; it is not transmitted to any server controlled by the developer; and it is not shared with anyone. Uninstalling the extension removes all of it.

## 4. Network requests made by the extension

### 4.1 Unsplash — only when "Show background image" is enabled

When the "Show background image" setting is on, the extension makes the following HTTPS requests directly from your browser:

| Endpoint | Purpose |
|---|---|
| `https://api.unsplash.com/photos/random` | Request a random photo from Unsplash's curated wallpaper collection. |
| `https://images.unsplash.com/...` | Load the selected photo. |
| `https://api.unsplash.com/photos/{id}/download` | A single tracking ping per fresh fetch, required by Unsplash's API guidelines. |

These requests include:

- **The extension's Unsplash API access key** (a `Client-ID` header). The access key identifies the *application*, not you.
- **Your IP address** (as with every HTTP request your browser makes).
- **Standard browser headers** (User-Agent, Accept, etc.) sent by your browser to every server.

These requests do **not** include your bookmarks, browsing history, search terms, any user identifier, analytics beacons, or cookies set by the developer.

The default refresh interval is 6 hours; with default settings, the extension contacts Unsplash at most a handful of times per day.

Unsplash is an independent third-party service. Once data reaches Unsplash, Unsplash's own privacy policy governs how it is handled. See: https://unsplash.com/privacy.

**You can stop all requests to Unsplash at any time** by opening the extension's settings (gear icon, bottom-right of the new tab page) and turning off "Show background image".

### 4.2 Bookmarked websites — favicon retrieval

To display the small icon next to each bookmark, the extension first reads the favicon from your browser's own local favicon cache:

- In **Firefox**, via the internal `page-icon:` URL scheme.
- In **Chrome**, via the internal `_favicon/` URL scheme (which is why the Chrome build requests the `favicon` permission — see §5).

When the browser already has a cached icon for the bookmarked page, **no network request is made**.

If the local cache doesn't have an icon for that URL, the extension loads `/favicon.ico` directly from the bookmarked site's own origin (for example, a `github.com` bookmark causes a request to `https://github.com/favicon.ico`). This is the same request your browser would normally make to render that site.

The extension does **not** route favicon requests through any third-party favicon-lookup service. If a bookmarked site does not host a favicon at the standard path, the extension displays a built-in globe icon and no further request is made.

## 5. Permissions

The extension requests only the permissions strictly required for its functionality. Some permissions differ between the Firefox and Chrome builds because of browser API differences.

| Permission | Build | Why it is needed |
|---|---|---|
| `bookmarks` | Both | Read your browser's bookmarks toolbar to display it on the new tab page. The extension only reads bookmarks; it does not modify, delete, or transmit them. |
| `storage` | Both | Persist your settings and the last-fetched background photo's metadata locally. |
| `search` | Both | Power the new tab page's search box using your default search engine. |
| `favicon` | Chrome only | Read favicons from Chrome's own local favicon cache via the `_favicon/` URL scheme. No network is performed by this permission — it reads icons the browser has already cached. |
| `tabs` | Both (optional) | Requested only when you enable "Tab groups". Reads the titles and URLs of tabs in a tab group so the group can be saved locally and reopened. On Firefox it also reads open tabs' favicon URLs to build the local favicon cache described in §3. Never transmitted. |
| `tabGroups` | Both (optional) | Requested only when you enable "Tab groups". Reads a group's name and color to save it, and re-creates a group when you reopen one. Never transmitted. |
| `https://api.unsplash.com/*` | Both | Make HTTPS requests to Unsplash to fetch a random wallpaper photo when "Show background image" is enabled. |

## 6. Legal basis for processing (EU/EEA users)

Where the General Data Protection Regulation (GDPR) applies, the extension's processing of the limited data described above (specifically, the transmission of your IP address to Unsplash when the background-image feature is in use) is carried out on the basis of your **consent**, given by enabling the feature, and on the basis of the **legitimate interest** of providing the feature you have chosen to use. You can withdraw consent at any time by turning the feature off in the extension's settings.

## 7. Your rights and how to exercise them

- **Stop network transmission to Unsplash**: open the extension's settings and turn off "Show background image". No further requests to Unsplash will be made.
- **Refresh or replace the cached photo**: settings → "Refresh background now".
- **Delete all local data the extension has stored**: uninstall the extension. Your browser removes the extension's storage automatically on uninstall.
- **Right to access, rectification, erasure, restriction, portability, and objection** (GDPR), and **right to know, delete, and opt-out of "sale" or sharing** (CCPA / California): the extension stores no personal data on any server controlled by the developer. All data the extension generates is held locally on your device and is fully under your control through the browser itself. The developer does not sell or share data, so there is nothing to opt out of.

## 8. Children's privacy

The extension is not directed at children under the age of 13 and does not knowingly collect personal information from anyone, including children.

## 9. Security

The extension uses HTTPS for every network request it makes. Locally stored data is protected by the same operating-system-level access controls that protect your browser profile. The extension does not contain remotely loaded code, eval'd code, or third-party tracking scripts.

## 10. Changes to this policy

If the extension's data practices change, this policy will be updated and the "Last updated" date at the top will reflect the change. Material changes will also be noted in the extension's release notes on addons.mozilla.org and the Chrome Web Store.
