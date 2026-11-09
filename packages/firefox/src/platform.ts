/// <reference types="firefox-webext-browser" />
// Firefox impl of the shared Platform interface. Wraps browser.* APIs in the
// shapes shared/ expects. Toolbar ID and search submit behavior are Firefox-
// specific; everything else is thin re-export of browser.*.

import type {
  Platform,
  BookmarkNode,
  StorageChanges,
  LiveTabGroup,
  ReopenableGroup,
} from "@mr-newtabby/shared/platform";

const TOOLBAR_ID = "toolbar_____";

const BOOKMARK_EVENTS = ["onCreated", "onRemoved", "onChanged", "onMoved"] as const;

export const platform: Platform = {
  bookmarks: {
    async getToolbar(): Promise<BookmarkNode> {
      const [node] = await browser.bookmarks.getSubTree(TOOLBAR_ID);
      return node as BookmarkNode;
    },
    onChanged(handler) {
      for (const ev of BOOKMARK_EVENTS) {
        const api = browser.bookmarks[ev];
        if (api) api.addListener(handler);
      }
      return () => {
        for (const ev of BOOKMARK_EVENTS) {
          const api = browser.bookmarks[ev];
          if (api) api.removeListener(handler);
        }
      };
    },
    cachedFaviconUrl() {
      // Firefox's favicon cache is not extension-accessible: `page-icon:` is
      // chrome-privileged, so extension pages get a blocked load (Bugzilla
      // 1315616). Favicons come from tabFavicons + /favicon.ico instead.
      return null;
    },
    async rename(id, title) {
      await browser.bookmarks.update(id, { title });
    },
    async remove(id) {
      await browser.bookmarks.remove(id);
    },
    async removeTree(id) {
      await browser.bookmarks.removeTree(id);
    },
    async move(id, parentId, index) {
      await browser.bookmarks.move(id, { parentId, index });
    },
  },
  storage: {
    get(keys) {
      // browser.storage.local.get accepts string[] or Record<string,default>;
      // Platform interface unifies both.
      return browser.storage.local.get(keys as any) as Promise<Record<string, unknown>>;
    },
    set(values) {
      return browser.storage.local.set(values);
    },
    onChanged(handler) {
      const wrapped = (changes: Record<string, browser.storage.StorageChange>, area: string) => {
        handler(changes as StorageChanges, area);
      };
      browser.storage.onChanged.addListener(wrapped);
      return () => browser.storage.onChanged.removeListener(wrapped);
    },
  },
  search: {
    async submit(query, { newTab }) {
      if (newTab) {
        const tab = await browser.tabs.create({ url: "about:blank", active: true });
        await browser.search.search({ query, tabId: tab.id });
      } else {
        const current = await browser.tabs.getCurrent();
        if (current?.id != null) {
          await browser.search.search({ query, tabId: current.id });
        }
      }
    },
  },
  // tabGroups + permissions are registered at module load (not lazily) so the
  // background worker wakes on group/permission changes without needing a
  // separate background listener registration step.
  tabGroups: {
    async queryOpen(): Promise<LiveTabGroup[]> {
      if (!browser.tabGroups) return [];
      const groups = await browser.tabGroups.query({});
      const out: LiveTabGroup[] = [];
      for (const g of groups) {
        const tabs = await browser.tabs.query({ groupId: g.id } as any);
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
        const tab = await browser.tabs.create({ url: t.url, active: false });
        if (tab.id != null) ids.push(tab.id);
      }
      if (!ids.length) return;
      const groupId = await browser.tabs.group({ tabIds: ids });
      // ReopenableGroup.color is string; browser.tabGroups.Color is a literal union.
      await browser.tabGroups.update(groupId, {
        title: group.title,
        color: group.color as browser.tabGroups.Color,
      });
    },
    onChanged(handler) {
      if (!browser.tabGroups) return () => {};
      browser.tabGroups.onCreated.addListener(handler);
      browser.tabGroups.onUpdated.addListener(handler);
      browser.tabGroups.onRemoved.addListener(handler);
      // browser.tabs.onUpdated listener signature differs from () => void;
      // cast to any for add AND remove to satisfy the stricter overload.
      browser.tabs.onUpdated.addListener(handler as any);
      browser.tabs.onRemoved.addListener(handler);
      browser.tabs.onAttached.addListener(handler);
      browser.tabs.onDetached.addListener(handler);
      return () => {
        browser.tabGroups.onCreated.removeListener(handler);
        browser.tabGroups.onUpdated.removeListener(handler);
        browser.tabGroups.onRemoved.removeListener(handler);
        browser.tabs.onUpdated.removeListener(handler as any);
        browser.tabs.onRemoved.removeListener(handler);
        browser.tabs.onAttached.removeListener(handler);
        browser.tabs.onDetached.removeListener(handler);
      };
    },
  },
  // Favicons observed from open tabs, feeding the shared favicon cache.
  // url/favIconUrl are only present on tab objects/events while the optional
  // "tabs" permission is granted; without it both members yield nothing.
  tabFavicons: {
    async queryOpen() {
      const tabs = await browser.tabs.query({});
      return tabs
        .filter((t) => !!t.url && !!t.favIconUrl)
        .map((t) => ({ pageUrl: t.url!, favIconUrl: t.favIconUrl! }));
    },
    onChanged(handler) {
      const listener = (
        _tabId: number,
        changeInfo: { favIconUrl?: string },
        tab: browser.tabs.Tab
      ) => {
        if (changeInfo.favIconUrl && tab.url) handler(tab.url, changeInfo.favIconUrl);
      };
      browser.tabs.onUpdated.addListener(listener);
      return () => browser.tabs.onUpdated.removeListener(listener);
    },
  },
  permissions: {
    contains(perms) {
      return browser.permissions.contains({ permissions: perms } as any);
    },
    request(perms) {
      return browser.permissions.request({ permissions: perms } as any);
    },
    remove(perms) {
      return browser.permissions.remove({ permissions: perms } as any);
    },
    onAdded(handler) {
      browser.permissions.onAdded.addListener(handler);
      return () => browser.permissions.onAdded.removeListener(handler);
    },
  },
  i18n: {
    getMessage(key) {
      return browser.i18n.getMessage(key) || "";
    },
    getUILanguage() {
      return browser.i18n.getUILanguage();
    },
  },
  runtime: {
    isFirefox: true,
  },
};
