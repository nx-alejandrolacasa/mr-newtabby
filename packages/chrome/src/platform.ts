/// <reference types="chrome" />
// Chrome impl of the shared Platform interface. Wraps chrome.* APIs in the
// shapes shared/ expects. Toolbar ID and search submit are Chrome-specific;
// everything else is a thin re-export of chrome.*.
//
// Chrome MV3's chrome.* APIs return promises natively when called without a
// callback, so no polyfill needed.

import type {
  Platform,
  BookmarkNode,
  StorageChanges,
  LiveTabGroup,
  ReopenableGroup,
} from "@mr-newtabby/shared/platform";

// Chrome's bookmarks bar root is "1" (the bookmark bar's stable ID). Compare
// with Firefox's "toolbar_____".
const TOOLBAR_ID = "1";

export const platform: Platform = {
  bookmarks: {
    async getToolbar(): Promise<BookmarkNode> {
      const [node] = await chrome.bookmarks.getSubTree(TOOLBAR_ID);
      return node as BookmarkNode;
    },
    onChanged(handler) {
      chrome.bookmarks.onCreated.addListener(handler);
      chrome.bookmarks.onRemoved.addListener(handler);
      chrome.bookmarks.onChanged.addListener(handler);
      chrome.bookmarks.onMoved.addListener(handler);
      return () => {
        chrome.bookmarks.onCreated.removeListener(handler);
        chrome.bookmarks.onRemoved.removeListener(handler);
        chrome.bookmarks.onChanged.removeListener(handler);
        chrome.bookmarks.onMoved.removeListener(handler);
      };
    },
    cachedFaviconUrl(pageUrl) {
      // chrome.runtime.getURL builds an extension-scoped URL to Chrome's
      // favicon cache. Requires the "favicon" permission (manifest.json).
      const url = new URL(chrome.runtime.getURL("/_favicon/"));
      url.searchParams.set("pageUrl", pageUrl);
      url.searchParams.set("size", "32");
      return url.toString();
    },
    async rename(id, title) {
      await chrome.bookmarks.update(id, { title });
    },
    async remove(id) {
      await chrome.bookmarks.remove(id);
    },
    async removeTree(id) {
      await chrome.bookmarks.removeTree(id);
    },
    async move(id, parentId, index) {
      if (index === undefined) {
        await chrome.bookmarks.move(id, { parentId });
        return;
      }
      // Chrome reads the index before taking the node out of its folder, so a
      // move further down the same folder has to aim one past the target.
      const [node] = await chrome.bookmarks.get(id);
      const movesDownSameFolder = node?.parentId === parentId && node.index! < index;
      await chrome.bookmarks.move(id, { parentId, index: movesDownSameFolder ? index + 1 : index });
    },
  },
  storage: {
    get(keys) {
      return chrome.storage.local.get(keys as any) as unknown as Promise<Record<string, unknown>>;
    },
    set(values) {
      return chrome.storage.local.set(values);
    },
    onChanged(handler) {
      const wrapped = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        handler(changes as StorageChanges, area);
      };
      chrome.storage.onChanged.addListener(wrapped);
      return () => chrome.storage.onChanged.removeListener(wrapped);
    },
  },
  search: {
    async submit(query, { newTab }) {
      // chrome.search.query() submits to the default search engine and
      // navigates either the current tab or a new one based on `disposition`.
      await chrome.search.query({
        text: query,
        disposition: newTab ? "NEW_TAB" : "CURRENT_TAB",
      });
    },
  },
  // tabGroups + permissions are registered at module load (not lazily) so the
  // MV3 service worker wakes on group/permission changes without needing a
  // separate background listener registration step.
  tabGroups: {
    async queryOpen(): Promise<LiveTabGroup[]> {
      if (!chrome.tabGroups) return [];
      const groups = await chrome.tabGroups.query({});
      const out: LiveTabGroup[] = [];
      for (const g of groups) {
        const tabs = await chrome.tabs.query({ groupId: g.id });
        out.push({
          id: g.id,
          title: g.title ?? "",
          color: g.color,
          tabs: tabs
            .filter((t) => !!t.url)
            .map((t) => ({ url: t.url!, title: t.title ?? "" })),
        });
      }
      return out;
    },
    async reopen(group: ReopenableGroup): Promise<void> {
      const ids: number[] = [];
      for (const t of group.tabs) {
        const tab = await chrome.tabs.create({ url: t.url, active: false });
        if (tab.id != null) ids.push(tab.id);
      }
      if (!ids.length) return;
      const groupId = await chrome.tabs.group({ tabIds: ids });
      await chrome.tabGroups.update(groupId, {
        title: group.title,
        color: group.color as chrome.tabGroups.ColorEnum,
      });
    },
    onChanged(handler) {
      if (!chrome.tabGroups) return () => {};
      chrome.tabGroups.onCreated.addListener(handler);
      chrome.tabGroups.onUpdated.addListener(handler);
      chrome.tabGroups.onRemoved.addListener(handler);
      chrome.tabs.onUpdated.addListener(handler);
      chrome.tabs.onRemoved.addListener(handler);
      chrome.tabs.onAttached.addListener(handler);
      chrome.tabs.onDetached.addListener(handler);
      return () => {
        chrome.tabGroups.onCreated.removeListener(handler);
        chrome.tabGroups.onUpdated.removeListener(handler);
        chrome.tabGroups.onRemoved.removeListener(handler);
        chrome.tabs.onUpdated.removeListener(handler);
        chrome.tabs.onRemoved.removeListener(handler);
        chrome.tabs.onAttached.removeListener(handler);
        chrome.tabs.onDetached.removeListener(handler);
      };
    },
  },
  permissions: {
    contains(perms) {
      return chrome.permissions.contains({ permissions: perms });
    },
    request(perms) {
      return chrome.permissions.request({ permissions: perms });
    },
    remove(perms) {
      return chrome.permissions.remove({ permissions: perms });
    },
    onAdded(handler) {
      // @types/chrome@0.0.280 types PermissionsAddedEvent without removeListener
      // (the underlying API supports it); cast to any for the unsubscribe call.
      chrome.permissions.onAdded.addListener(handler);
      return () => (chrome.permissions.onAdded as any).removeListener(handler);
    },
  },
  i18n: {
    getMessage(key) {
      return chrome.i18n.getMessage(key) || "";
    },
    getUILanguage() {
      return chrome.i18n.getUILanguage();
    },
  },
  runtime: {
    isFirefox: false,
  },
};
