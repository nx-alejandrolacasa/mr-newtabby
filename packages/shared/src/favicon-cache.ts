import { getPlatform } from "@/platform";

// Favicon cache captured from open tabs (tabs.favIconUrl). Firefox gives
// extensions no access to its favicon database — `page-icon:` is
// chrome-privileged (Bugzilla 1315616) — so instead we remember the icons of
// pages the user actually visits: no network, no third parties. Keyed by
// origin, the same granularity as the `/favicon.ico` fallback.
//
// The background script runs startFaviconWatcher(); the new-tab page reads
// the persisted map via loadFaviconMap(). Only meaningful on platforms that
// provide Platform.tabFavicons (Firefox); elsewhere both are no-ops.

interface FaviconEntry {
  icon: string;
  // Last time the icon was (re)captured — used only to prune oldest entries.
  at: number;
}

// storage.local key under which the origin → entry map is persisted.
const STORE_KEY = "favicons";
const MAX_ENTRIES = 500;
// favIconUrl may be a data: URL; skip pathological ones so the store stays small.
const MAX_ICON_LENGTH = 100 * 1024;
// Coalesce bursts of tab updates into a single write.
const DEBOUNCE_MS = 250;

export function originOf(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function usableIcon(favIconUrl: string): boolean {
  // http(s) icon URLs and inline data: icons render fine from an extension
  // page; anything else (chrome://, moz-extension://, …) won't.
  return (
    favIconUrl.length <= MAX_ICON_LENGTH &&
    /^(https?|data):/.test(favIconUrl)
  );
}

async function loadStore(): Promise<Record<string, FaviconEntry>> {
  const raw = await getPlatform().storage.get([STORE_KEY]);
  const map = (raw as { favicons?: unknown }).favicons;
  return map && typeof map === "object" ? { ...(map as Record<string, FaviconEntry>) } : {};
}

// origin → icon URL, for the bookmarks renderer.
export async function loadFaviconMap(): Promise<Record<string, string>> {
  const store = await loadStore();
  const out: Record<string, string> = {};
  for (const [origin, entry] of Object.entries(store)) {
    if (entry && typeof entry.icon === "string") out[origin] = entry.icon;
  }
  return out;
}

// Start capturing favicons: seed from the tabs open right now, then follow
// favicon changes. Writes are debounced and skipped when nothing changed
// (revisiting a site fires tab updates constantly). Returns an unsubscribe.
export function startFaviconWatcher(): () => void {
  const tf = getPlatform().tabFavicons;
  if (!tf) return () => {};

  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    const store = await loadStore();
    let changed = false;
    for (const [origin, icon] of pending) {
      if (store[origin]?.icon === icon) continue;
      store[origin] = { icon, at: Date.now() };
      changed = true;
    }
    pending.clear();
    if (!changed) return;
    const entries = Object.entries(store);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].at - a[1].at);
      entries.length = MAX_ENTRIES;
    }
    await getPlatform().storage.set({ [STORE_KEY]: Object.fromEntries(entries) });
  };

  const record = (pageUrl: string, favIconUrl: string) => {
    const origin = originOf(pageUrl);
    if (!origin || !usableIcon(favIconUrl)) return;
    pending.set(origin, favIconUrl);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void flush(), DEBOUNCE_MS);
  };

  void tf.queryOpen().then((tabs) => {
    for (const t of tabs) record(t.pageUrl, t.favIconUrl);
  });
  const off = tf.onChanged(record);
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    off();
  };
}
