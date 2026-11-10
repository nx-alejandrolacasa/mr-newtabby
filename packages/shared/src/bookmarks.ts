import { getPlatform, type BookmarkNode } from "@/platform";
import { t } from "@/i18n";
import { getFolderEmoji, getSettings } from "@/settings";
import { renderTabGroups } from "@/tab-groups-bar";
import { loadFaviconMap, originOf } from "@/favicon-cache";

const SVG_NS = "http://www.w3.org/2000/svg";

let topLevelNodes: BookmarkNode[] = [];
let toolbarId = "";

export function getToolbarId(): string {
  return toolbarId;
}

// id → node for everything rendered this pass; lets the context menu resolve
// the element it was opened on back to its bookmark.
const nodeIndex = new Map<string, BookmarkNode>();

export function getBookmarkNode(id: string): BookmarkNode | undefined {
  return nodeIndex.get(id);
}

function indexTree(nodes: BookmarkNode[]): void {
  for (const node of nodes) {
    nodeIndex.set(node.id, node);
    if (node.children) indexTree(node.children);
  }
}

// origin → icon URL captured from open tabs, for the bookmarked origins only.
// Copied to localStorage so the bar renders without waiting on extension
// storage, which is slow to answer a new tab's first read.
const ICONS_KEY = "bookmarkIcons";
let faviconMap: Record<string, string> = readIconMirror();

function readIconMirror(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ICONS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

async function refreshFavicons(): Promise<void> {
  const all = await loadFaviconMap();
  const used: Record<string, string> = {};
  for (const node of nodeIndex.values()) {
    const origin = node.url && originOf(node.url);
    if (origin && all[origin]) used[origin] = all[origin];
  }
  const origins = Object.keys(used);
  const unchanged =
    origins.length === Object.keys(faviconMap).length &&
    origins.every((origin) => faviconMap[origin] === used[origin]);
  if (unchanged) return;
  faviconMap = used;
  try {
    localStorage.setItem(ICONS_KEY, JSON.stringify(used));
  } catch {
    /* ignore */
  }
  void renderBookmarks();
}

export function isFolder(node: BookmarkNode): boolean {
  return node.type === "folder" || (!node.url && Array.isArray(node.children));
}

function sortFoldersFirst<T extends BookmarkNode>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => (isFolder(a) ? 0 : 1) - (isFolder(b) ? 0 : 1));
}

function faviconSources(url: string): string[] {
  // 1. The browser's cached favicon, where extensions can reach it — Chrome
  //    `_favicon/`. Firefox has no extension-accessible cache (its `page-icon:`
  //    is chrome-privileged), so its platform shim returns null here.
  // 2. Icons remembered from the user's open tabs (favicon-cache.ts) —
  //    populated on Firefox while the optional "tabs" permission is granted.
  // 3. The site's own `/favicon.ico` — direct fetch, no third-party service.
  //
  // Third-party favicon services (Google, DuckDuckGo, etc.) are deliberately
  // avoided: they would receive each bookmark's hostname.
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return [];
    const sources: string[] = [];
    const cached = getPlatform().bookmarks.cachedFaviconUrl(url);
    if (cached) sources.push(cached);
    const remembered = faviconMap[u.origin];
    if (remembered) sources.push(remembered);
    sources.push(`${u.origin}/favicon.ico`);
    return sources;
  } catch {
    return [];
  }
}

function createFolderEmoji(emoji: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "folder-emoji";
  span.textContent = emoji;
  span.setAttribute("aria-hidden", "true");
  return span;
}

function createFolderIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "folder-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
  );
  svg.append(path);
  return svg;
}

function createDoubleChevronIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "folder-icon overflow-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const a = document.createElementNS(SVG_NS, "polyline");
  a.setAttribute("points", "7 6 13 12 7 18");
  const b = document.createElementNS(SVG_NS, "polyline");
  b.setAttribute("points", "13 6 19 12 13 18");
  svg.append(a, b);
  return svg;
}

// Small downward caret marking a top-level folder (vs. a loose bookmark link).
// Mirrors the chevron used on the landing site's bookmark bar.
function createCaretIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "folder-caret");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.append(path);
  return svg;
}

function createGlobeIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "bookmark-icon globe-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "10");
  const equator = document.createElementNS(SVG_NS, "line");
  equator.setAttribute("x1", "2");
  equator.setAttribute("y1", "12");
  equator.setAttribute("x2", "22");
  equator.setAttribute("y2", "12");
  const meridian = document.createElementNS(SVG_NS, "path");
  meridian.setAttribute(
    "d",
    "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
  );
  svg.append(circle, equator, meridian);
  return svg;
}

export function createBookmarkLink(node: BookmarkNode): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = "bookmark-item";
  a.dataset.bookmarkId = node.id;
  a.href = node.url!;
  a.title = `${node.title || node.url}\n${node.url}`;

  const sources = faviconSources(node.url!);
  let icon: HTMLImageElement | SVGSVGElement;
  if (sources.length === 0) {
    icon = createGlobeIcon();
  } else {
    const img = document.createElement("img");
    img.className = "bookmark-icon";
    img.alt = "";
    img.loading = "lazy";
    let attempt = 0;
    const tryNext = () => {
      attempt += 1;
      if (attempt < sources.length) {
        img.src = sources[attempt]!;
      } else if (img.parentNode) {
        img.replaceWith(createGlobeIcon());
      }
    };
    img.addEventListener("error", tryNext);
    img.addEventListener("load", () => {
      if (img.naturalWidth <= 1) tryNext();
      scheduleReflow();
    });
    img.src = sources[0]!;
    icon = img;
  }

  a.append(icon);
  if (node.title) {
    const span = document.createElement("span");
    span.className = "bookmark-title";
    span.textContent = node.title;
    a.append(span);
  }
  return a;
}

export function createDropdownEntry(node: BookmarkNode): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.itemId = node.id;

  if (isFolder(node)) {
    li.classList.add("has-submenu");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "submenu-trigger";
    trigger.dataset.bookmarkId = node.id;
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.className = "bookmark-title";
    label.textContent = node.title || t("unnamedFolder");

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "›";
    chevron.setAttribute("aria-hidden", "true");

    trigger.append(createFolderIcon(), label, chevron);

    const submenu = document.createElement("ul");
    submenu.className = "folder-dropdown submenu";
    populateDropdown(submenu, node.children || [], node.id);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (li.classList.contains("submenu-open")) closeSubmenu(li);
      else openFolder(trigger);
    });

    li.addEventListener("mouseenter", () => {
      adjustDropdownPosition(submenu, true);
    });

    li.append(trigger, submenu);
  } else if (node.url) {
    li.append(createBookmarkLink(node));
  }

  return li;
}

function populateDropdown(ul: HTMLUListElement, children: BookmarkNode[], parentId: string): void {
  ul.textContent = "";
  ul.dataset.parentId = parentId;
  if (!children.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = t("emptyFolder");
    ul.append(empty);
    return;
  }
  for (const child of sortFoldersFirst(children)) {
    ul.append(createDropdownEntry(child));
  }
}

export function createTopLevelFolder(node: BookmarkNode): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "bookmark-folder";
  wrapper.dataset.itemId = node.id;

  const button = document.createElement("button");
  button.className = "bookmark-item folder-button";
  button.dataset.bookmarkId = node.id;
  button.title = node.title;
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");

  const label = document.createElement("span");
  label.className = "bookmark-title";
  label.textContent = node.title || t("unnamedFolder");

  const emoji = getFolderEmoji(node.id);
  button.append(emoji ? createFolderEmoji(emoji) : createFolderIcon(), label, createCaretIcon());

  const dropdown = document.createElement("ul");
  dropdown.className = "folder-dropdown";
  populateDropdown(dropdown, node.children || [], node.id);

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = wrapper.classList.contains("open");
    closeAllDropdowns();
    if (!wasOpen) openFolder(button);
  });

  wrapper.append(button, dropdown);
  return wrapper;
}

function createOverflowChevron(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "bookmark-folder bookmark-overflow";
  wrapper.hidden = true;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "bookmark-item folder-button";
  const label = t("moreBookmarks");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  button.append(createDoubleChevronIcon());

  const dropdown = document.createElement("ul");
  dropdown.className = "folder-dropdown";

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = wrapper.classList.contains("open");
    closeAllDropdowns();
    if (!wasOpen) openFolder(button);
  });

  wrapper.append(button, dropdown);
  return wrapper;
}

// While a drag is in flight the bar's DOM is the drag's working state, so
// re-renders and overflow reflows wait until it is released.
let renderHeld = false;
let renderPending = false;

export function holdRendering(): void {
  renderHeld = true;
}

export function releaseRendering(): void {
  renderHeld = false;
  if (renderPending) {
    renderPending = false;
    void renderBookmarks();
  } else {
    scheduleReflow();
  }
}

let reflowScheduled = false;
export function scheduleReflow(): void {
  if (reflowScheduled) return;
  reflowScheduled = true;
  requestAnimationFrame(() => {
    reflowScheduled = false;
    reflowBookmarksBar();
  });
}

// A fit-content bar (centred bookmarks) is only as wide as its items made it;
// stretching it lets its max-width say how much room there is.
function widestClientWidth(bar: HTMLElement): number {
  bar.style.width = "100vw";
  const width = bar.clientWidth;
  bar.style.removeProperty("width");
  return width;
}

function reflowBookmarksBar(): void {
  if (renderHeld) return;
  const bar = document.getElementById("bookmarks-bar");
  if (!bar) return;
  const overflow = bar.querySelector<HTMLElement>(".bookmark-overflow");
  if (!overflow) return;

  const groupsFolder = bar.querySelector<HTMLElement>(":scope > .tab-groups-folder");
  const items = Array.from(bar.children).filter(
    (el): el is HTMLElement => el !== overflow && el !== groupsFolder
  );
  for (const item of items) item.style.removeProperty("display");
  overflow.hidden = false;

  void bar.offsetWidth;

  const barStyle = getComputedStyle(bar);
  const padL = parseFloat(barStyle.paddingLeft) || 0;
  const padR = parseFloat(barStyle.paddingRight) || 0;
  const gap = parseFloat(barStyle.gap) || 0;
  const overflowWidth = overflow.getBoundingClientRect().width;
  const available = widestClientWidth(bar) - padL - padR - overflowWidth - gap - 4;

  let used = groupsFolder?.getBoundingClientRect().width ?? 0;
  let firstHidden = -1;
  for (let i = 0; i < items.length; i++) {
    const itemWidth = items[i]!.getBoundingClientRect().width;
    if (used > 0) used += gap;
    used += itemWidth;
    if (used > available) {
      firstHidden = i;
      break;
    }
  }

  if (firstHidden === -1) {
    overflow.hidden = true;
    return;
  }

  for (let i = firstHidden; i < items.length; i++) {
    items[i]!.style.display = "none";
  }

  const dropdown = overflow.querySelector<HTMLUListElement>(".folder-dropdown");
  if (dropdown) populateDropdown(dropdown, topLevelNodes.slice(firstHidden), toolbarId);
}

function adjustDropdownPosition(dropdown: HTMLElement | null, isSubmenu = false): void {
  if (!dropdown) return;
  const flipClass = isSubmenu ? "align-left" : "align-right";
  dropdown.classList.remove(flipClass);
  const rect = dropdown.getBoundingClientRect();
  const viewportRight = window.innerWidth - 8;
  if (rect.right > viewportRight) {
    dropdown.classList.add(flipClass);
  }
}

function closeSubmenu(li: Element): void {
  li.classList.remove("submenu-open");
  li.querySelector(":scope > .submenu-trigger")?.setAttribute("aria-expanded", "false");
}

export function closeFolder(wrapper: Element): void {
  if (wrapper.matches("li.has-submenu")) closeSubmenu(wrapper);
  wrapper.classList.remove("open");
  wrapper.querySelector(":scope > .folder-button")?.setAttribute("aria-expanded", "false");
  wrapper.querySelectorAll(".has-submenu.submenu-open").forEach(closeSubmenu);
}

// Folders containing `keep` stay open, so a menu can close everything except
// the path to the item the user is acting on.
export function closeAllDropdowns(keep?: Element): void {
  document
    .querySelectorAll(".bookmark-folder.open, .has-submenu.submenu-open")
    .forEach((wrapper) => {
      if (!keep || !wrapper.contains(keep)) closeFolder(wrapper);
    });
}

export function openFolder(trigger: HTMLElement): void {
  const submenuLi = trigger.matches(".submenu-trigger") ? trigger.parentElement : null;
  if (submenuLi) {
    for (const sibling of submenuLi.parentElement?.children ?? []) {
      if (sibling !== submenuLi && sibling.classList.contains("submenu-open")) closeFolder(sibling);
    }
    submenuLi.classList.add("submenu-open");
    adjustDropdownPosition(submenuLi.querySelector<HTMLElement>(":scope > .submenu"), true);
  } else {
    const wrapper = trigger.closest(".bookmark-folder");
    if (!wrapper) return;
    document.querySelectorAll(".bookmark-folder.open").forEach((other) => {
      if (other !== wrapper) closeFolder(other);
    });
    wrapper.classList.add("open");
    if (wrapper.classList.contains("bookmark-overflow")) {
      adjustDropdownPosition(wrapper.querySelector<HTMLElement>(":scope > .folder-dropdown"), false);
    }
  }
  trigger.setAttribute("aria-expanded", "true");
}

// Hover-opened submenus close as soon as the pointer leaves them; pinning
// keeps every submenu around an item open while a menu or drag needs it.
export function pinOpenPath(item: Element): void {
  let li = item.closest("[data-item-id]")?.parentElement?.closest("li.has-submenu");
  while (li) {
    li.classList.add("submenu-open");
    li.querySelector(":scope > .submenu-trigger")?.setAttribute("aria-expanded", "true");
    li = li.parentElement?.closest("li.has-submenu");
  }
}

// A modifier-click opens the link in a background tab, so the menu it came
// from stays open for the next one.
export function opensInBackground(e: MouseEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !!(e.target as Element).closest?.(".folder-dropdown a[href]");
}

function openFolderIds(bar: HTMLElement): string[] {
  return Array.from(
    bar.querySelectorAll<HTMLElement>(
      ".bookmark-folder.open > .folder-button[data-bookmark-id], .has-submenu.submenu-open > .submenu-trigger[data-bookmark-id]"
    ),
    (trigger) => trigger.dataset.bookmarkId!
  );
}

function reopenFolders(bar: HTMLElement, ids: string[]): void {
  for (const id of ids) {
    const trigger = bar.querySelector<HTMLElement>(
      `.folder-button[data-bookmark-id="${CSS.escape(id)}"], .submenu-trigger[data-bookmark-id="${CSS.escape(id)}"]`
    );
    if (trigger) openFolder(trigger);
  }
}

// With no bookmarks the bar itself is hidden (CSS keys off `.empty`, keeping
// it visible if the tab-groups folder lives there) and a dismissable notice
// explains why — once.
function showEmptyBarNotice(empty: boolean): void {
  const notice = document.getElementById("empty-bar-notice");
  if (notice) notice.hidden = !empty || getSettings().emptyBarNoticeDismissed;
}

export async function renderBookmarks(): Promise<void> {
  const bar = document.getElementById("bookmarks-bar");
  if (!bar) return;
  if (renderHeld) {
    renderPending = true;
    return;
  }
  try {
    const toolbar = await getPlatform().bookmarks.getToolbar();
    if (renderHeld) {
      renderPending = true;
      return;
    }
    // Everything below is synchronous, so overlapping renders can't interleave.
    const reopenIds = openFolderIds(bar);
    const overflowWasOpen = !!bar.querySelector(".bookmark-overflow.open");
    bar.textContent = "";
    nodeIndex.clear();
    toolbarId = toolbar.id;
    bar.dataset.parentId = toolbar.id;
    const items = toolbar.children || [];
    bar.classList.toggle("empty", !items.length);
    showEmptyBarNotice(!items.length);
    if (!items.length) {
      void renderTabGroups();
      return;
    }
    nodeIndex.set(toolbar.id, toolbar);
    indexTree(items);
    topLevelNodes = sortFoldersFirst(items);
    for (const node of topLevelNodes) {
      if (isFolder(node)) {
        bar.append(createTopLevelFolder(node));
      } else if (node.url) {
        const link = createBookmarkLink(node);
        link.dataset.itemId = node.id;
        bar.append(link);
      }
    }
    const overflow = createOverflowChevron();
    bar.append(overflow);
    reflowBookmarksBar();
    if (overflowWasOpen) openFolder(overflow.querySelector<HTMLElement>(".folder-button")!);
    reopenFolders(bar, reopenIds);
    void renderTabGroups();
    void refreshFavicons();
  } catch (err) {
    bar.textContent = "";
    const msg = document.createElement("span");
    msg.className = "empty-state";
    msg.textContent = t("loadError");
    bar.append(msg);
    console.error(err);
  } finally {
    bar.classList.add("loaded");
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;

export function setupBookmarksListeners(): () => void {
  // Returns an unsubscribe (not used today, but enables future teardown).
  const unsubscribe = getPlatform().bookmarks.onChanged(renderBookmarks);
  const onResize = () => {
    closeAllDropdowns();
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scheduleReflow, 100);
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("load", scheduleReflow);
  return () => {
    unsubscribe();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("load", scheduleReflow);
  };
}
