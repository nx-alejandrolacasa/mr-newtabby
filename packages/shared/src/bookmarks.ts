import { getPlatform, type BookmarkNode } from "@/platform";
import { t } from "@/i18n";
import { getFolderEmoji, getSettings } from "@/settings";
import { renderTabGroups } from "@/tab-groups-bar";
import { loadFaviconMap } from "@/favicon-cache";

const SVG_NS = "http://www.w3.org/2000/svg";

let topLevelNodes: BookmarkNode[] = [];

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

// origin → icon URL captured from open tabs; reloaded on each render.
let faviconMap: Record<string, string> = {};

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

function createBookmarkLink(node: BookmarkNode): HTMLAnchorElement {
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

function createDropdownEntry(node: BookmarkNode): HTMLLIElement {
  const li = document.createElement("li");

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
    populateDropdown(submenu, node.children || []);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = li.classList.toggle("submenu-open");
      trigger.setAttribute("aria-expanded", String(isOpen));
      if (li.parentElement) {
        Array.from(li.parentElement.children).forEach((sib) => {
          if (sib !== li && sib.classList.contains("submenu-open")) {
            sib.classList.remove("submenu-open");
            const sibTrigger = sib.querySelector(".submenu-trigger");
            if (sibTrigger) sibTrigger.setAttribute("aria-expanded", "false");
          }
        });
      }
      if (isOpen) adjustDropdownPosition(submenu, true);
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

function populateDropdown(ul: HTMLUListElement, children: BookmarkNode[]): void {
  ul.textContent = "";
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

function createTopLevelFolder(node: BookmarkNode): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "bookmark-folder";

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
  populateDropdown(dropdown, node.children || []);

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = wrapper.classList.contains("open");
    closeAllDropdowns();
    if (!wasOpen) {
      wrapper.classList.add("open");
      button.setAttribute("aria-expanded", "true");
    }
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
    if (!wasOpen) {
      wrapper.classList.add("open");
      button.setAttribute("aria-expanded", "true");
      adjustDropdownPosition(dropdown, false);
    }
  });

  wrapper.append(button, dropdown);
  return wrapper;
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

function reflowBookmarksBar(): void {
  const bar = document.getElementById("bookmarks-bar");
  if (!bar) return;
  const overflow = bar.querySelector<HTMLElement>(".bookmark-overflow");
  if (!overflow) return;

  const items = Array.from(bar.children).filter((el): el is HTMLElement => el !== overflow) as HTMLElement[];
  for (const item of items) item.style.removeProperty("display");
  overflow.hidden = false;

  void bar.offsetWidth;

  const barStyle = getComputedStyle(bar);
  const padL = parseFloat(barStyle.paddingLeft) || 0;
  const padR = parseFloat(barStyle.paddingRight) || 0;
  const gap = parseFloat(barStyle.gap) || 0;
  const overflowWidth = overflow.getBoundingClientRect().width;
  const available = bar.clientWidth - padL - padR - overflowWidth - gap - 4;

  let used = 0;
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
  if (dropdown) populateDropdown(dropdown, topLevelNodes.slice(firstHidden));
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

export function closeAllDropdowns(): void {
  document.querySelectorAll(".bookmark-folder.open").forEach((el) => {
    el.classList.remove("open");
    const btn = el.querySelector(".folder-button");
    if (btn) btn.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".has-submenu.submenu-open").forEach((el) => {
    el.classList.remove("submenu-open");
    const trigger = el.querySelector(".submenu-trigger");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  });
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
  bar.textContent = "";
  nodeIndex.clear();
  try {
    const [toolbar, favicons] = await Promise.all([
      getPlatform().bookmarks.getToolbar(),
      loadFaviconMap(),
    ]);
    faviconMap = favicons;
    const items = toolbar.children || [];
    bar.classList.toggle("empty", !items.length);
    showEmptyBarNotice(!items.length);
    if (!items.length) {
      void renderTabGroups();
      return;
    }
    indexTree(items);
    topLevelNodes = sortFoldersFirst(items);
    for (const node of topLevelNodes) {
      if (isFolder(node)) {
        bar.append(createTopLevelFolder(node));
      } else if (node.url) {
        bar.append(createBookmarkLink(node));
      }
    }
    bar.append(createOverflowChevron());
    scheduleReflow();
    void renderTabGroups();
  } catch (err) {
    const msg = document.createElement("span");
    msg.className = "empty-state";
    msg.textContent = t("loadError");
    bar.append(msg);
    console.error(err);
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
