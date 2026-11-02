// The browser-agnostic surface shared/* code uses. Each platform package
// (@mr-newtabby/firefox, @mr-newtabby/chrome) provides a concrete impl via its own
// platform.ts and passes it to startApp(platform) at extension load.
//
// The interface mirrors only the WebExtensions APIs newtab.ts actually calls.
// Anything not used today is intentionally not in the interface.

export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  type?: "bookmark" | "folder" | "separator";
  children?: BookmarkNode[];
}

// A tab group as read from the browser while it is open. `id` is the native
// groupId — stable only within a session (it changes across restarts/reopens).
export interface LiveTabGroup {
  id: number;
  title: string;
  color: string;
  tabs: { url: string; title: string }[];
}

// The minimum needed to re-create a group: open these URLs and bundle them.
export interface ReopenableGroup {
  title: string;
  color: string;
  tabs: { url: string }[];
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export type StorageChanges = Record<string, StorageChange>;

export interface Platform {
  bookmarks: {
    getToolbar(): Promise<BookmarkNode>;
    onChanged(handler: () => void): () => void;
    // Returns the browser's cached-favicon URL for a page (Chrome `_favicon/`),
    // or null when the browser exposes no extension-accessible favicon cache
    // (Firefox: `page-icon:` is chrome-privileged — Bugzilla 1315616).
    cachedFaviconUrl(pageUrl: string): string | null;
    rename(id: string, title: string): Promise<void>;
    remove(id: string): Promise<void>;
    removeTree(id: string): Promise<void>;
  };
  storage: {
    get<K extends string>(keys: readonly K[] | Record<K, unknown>): Promise<Record<K, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
    onChanged(handler: (changes: StorageChanges, area: string) => void): () => void;
  };
  search: {
    submit(query: string, opts: { newTab: boolean }): Promise<void>;
  };
  i18n: {
    getMessage(key: string): string;
    getUILanguage(): string;
  };
  runtime: {
    isFirefox: boolean;
  };
  // Present only on platforms that support tab groups. Guard with `?.`.
  tabGroups?: {
    queryOpen(): Promise<LiveTabGroup[]>;
    reopen(group: ReopenableGroup): Promise<void>;
    // Fires on any group/tab change relevant to snapshots. Caller debounces
    // and re-queries via queryOpen(); the payload is intentionally empty.
    onChanged(handler: () => void): () => void;
  };
  // Present only on platforms that need favicons observed from open tabs
  // (Firefox, whose favicon cache is not extension-accessible). Tab data is
  // only exposed while the optional "tabs" permission is granted; without it
  // queryOpen yields nothing and onChanged never fires. Guard with `?.`.
  tabFavicons?: {
    // Favicons of the tabs open right now — seeds the cache on startup.
    queryOpen(): Promise<{ pageUrl: string; favIconUrl: string }[]>;
    onChanged(handler: (pageUrl: string, favIconUrl: string) => void): () => void;
  };
  // optional-permission management. The permissions API itself is always
  // available; these wrap request/contains/remove + a grant event.
  permissions?: {
    contains(perms: string[]): Promise<boolean>;
    request(perms: string[]): Promise<boolean>;
    remove(perms: string[]): Promise<boolean>;
    onAdded(handler: () => void): () => void;
  };
}

// Runtime binding. startApp() in newtab.ts calls setPlatform() before any
// other shared module runs. getPlatform() throws if called before init —
// catches "forgot to call startApp()" early.

let current: Platform | null = null;

export function setPlatform(p: Platform): void {
  current = p;
}

export function getPlatform(): Platform {
  if (!current) {
    throw new Error("Platform not initialized. Did entry.ts forget to call startApp()?");
  }
  return current;
}
