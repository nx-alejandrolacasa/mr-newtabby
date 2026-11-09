import { getPlatform, type BookmarkNode } from "@/platform";
import {
  getBookmarkNode,
  getToolbarId,
  isFolder,
  createBookmarkLink,
  createTopLevelFolder,
  createDropdownEntry,
  openFolder,
  closeFolder,
  pinOpenPath,
  holdRendering,
  releaseRendering,
  renderBookmarks,
} from "@/bookmarks";

const DRAG_THRESHOLD_PX = 5;
const SPRING_OPEN_MS = 550;
const STALE_FOLDER_CLOSE_MS = 450;
// How far outside a list the pointer may stray and still drop into it; the
// bar's reach also bridges the 16px gap down to its dropdowns.
const BAR_REACH_PX = 18;
const MENU_REACH_PX = 8;
const SETTLE_EASE = "cubic-bezier(0.2, 0.9, 0.3, 1.15)";
const ICON_SELECTOR = ".bookmark-icon, .folder-icon, .folder-emoji";

type DropTarget =
  | { kind: "slot"; list: HTMLElement; index: number }
  | { kind: "into"; trigger: HTMLElement; parentId: string };

interface PendingDrag {
  handle: HTMLElement;
  source: HTMLElement;
  node: BookmarkNode;
  startX: number;
  startY: number;
}

interface ActiveDrag extends PendingDrag {
  folder: boolean;
  ghost: HTMLElement;
  ghostIconOffset: { x: number; y: number };
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  lastFrameX: number;
  tilt: number;
  frame: number;
  placeholder: HTMLElement | null;
  barSpacer: HTMLElement | null;
  target: DropTarget | null;
  springTarget: HTMLElement | null;
  springTimer?: ReturnType<typeof setTimeout>;
  staleTimer?: ReturnType<typeof setTimeout>;
}

let pending: PendingDrag | null = null;
let drag: ActiveDrag | null = null;
// True from release until the drop animation has played and the move landed.
let settling = false;

function motionMs(ms: number): number {
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

function getBar(): HTMLElement {
  return document.getElementById("bookmarks-bar")!;
}

function isShown(el: Element): boolean {
  return el.getClientRects().length > 0;
}

function isFolderItem(el: HTMLElement): boolean {
  const node = getBookmarkNode(el.dataset.itemId!);
  return !!node && isFolder(node);
}

function isWithin(id: string, ancestorId: string): boolean {
  for (let node = getBookmarkNode(id); node; node = getBookmarkNode(node.parentId ?? "")) {
    if (node.id === ancestorId) return true;
  }
  return false;
}

// The draggable items of a list that share the dragged node's kind: the bar
// and menus show folders first, so a folder only reorders among folders and
// a link among links.
function sameKindItems(list: HTMLElement, d: ActiveDrag): HTMLElement[] {
  return Array.from(list.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && !!el.dataset.itemId && el !== d.source && isFolderItem(el) === d.folder
  );
}

function otherKindItems(list: HTMLElement, d: ActiveDrag): HTMLElement[] {
  return Array.from(list.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && !!el.dataset.itemId && el !== d.source && isFolderItem(el) !== d.folder
  );
}

function axisOf(list: HTMLElement): "x" | "y" {
  return list === getBar() ? "x" : "y";
}

// offsetLeft/Top ignore the transforms of in-flight slide animations, so the
// slot under the pointer doesn't flicker while items are still moving.
function slotIndexAt(list: HTMLElement, d: ActiveDrag): number {
  const rect = list.getBoundingClientRect();
  const horizontal = axisOf(list) === "x";
  const pos = horizontal ? d.x - rect.left : d.y - rect.top;
  const shown = sameKindItems(list, d).filter(isShown);
  const index = shown.findIndex((el) =>
    horizontal ? pos < el.offsetLeft + el.offsetWidth / 2 : pos < el.offsetTop + el.offsetHeight / 2
  );
  return index === -1 ? shown.length : index;
}

function nestingDepth(el: Element): number {
  let depth = 0;
  for (let up = el.parentElement?.closest(".folder-dropdown"); up; up = up.parentElement?.closest(".folder-dropdown")) {
    depth += 1;
  }
  return depth;
}

function droppableLists(): HTMLElement[] {
  const bar = getBar();
  const menus = Array.from(bar.querySelectorAll<HTMLElement>(".folder-dropdown[data-parent-id]"))
    .filter(isShown)
    .sort((a, b) => nestingDepth(b) - nestingDepth(a));
  return [...menus, bar];
}

function reaches(list: HTMLElement, x: number, y: number): boolean {
  const r = list.getBoundingClientRect();
  const isBar = list === getBar();
  const dx = isBar ? 0 : MENU_REACH_PX;
  const dy = isBar ? BAR_REACH_PX : MENU_REACH_PX;
  return x >= r.left - dx && x <= r.right + dx && y >= r.top - dy && y <= r.bottom + dy;
}

function inMiddleHalf(el: HTMLElement, list: HTMLElement, d: ActiveDrag): boolean {
  const r = el.getBoundingClientRect();
  return axisOf(list) === "x"
    ? d.x > r.left + r.width / 4 && d.x < r.right - r.width / 4
    : d.y > r.top + r.height / 4 && d.y < r.bottom - r.height / 4;
}

function folderDropAt(list: HTMLElement, hit: Element | null, d: ActiveDrag): DropTarget | null {
  const trigger = hit?.closest<HTMLElement>(".folder-button, .submenu-trigger");
  if (!trigger || trigger.closest(".tab-groups-folder")) return null;
  const owner = trigger.parentElement?.closest(".folder-dropdown") ?? getBar();
  if (owner !== list) return null;
  const isOverflow = !!trigger.closest(".bookmark-overflow");
  const parentId = isOverflow ? getToolbarId() : trigger.dataset.bookmarkId;
  if (!parentId) return null;
  if (d.folder) {
    if (isWithin(parentId, d.node.id)) return null;
    // A folder over another folder's edges reorders; only its middle drops in.
    if (!isOverflow && !inMiddleHalf(trigger, list, d)) return null;
  }
  return { kind: "into", trigger, parentId };
}

function findTarget(d: ActiveDrag, hit: Element | null): DropTarget | null {
  const list = droppableLists().find((l) => reaches(l, d.x, d.y));
  if (!list) return null;
  const into = folderDropAt(list, hit, d);
  if (into) return into;
  if (d.folder && isWithin(list.dataset.parentId!, d.node.id)) return null;
  return { kind: "slot", list, index: slotIndexAt(list, d) };
}

// FLIP: measure where items are (mid-animation included), apply the DOM
// change, then slide each item from its old spot to its new one.
function slideItems(lists: (HTMLElement | null | undefined)[], change: () => void, exclude?: Element): void {
  const before = new Map<HTMLElement, DOMRect>();
  for (const list of new Set(lists)) {
    if (!list) continue;
    for (const el of list.children) {
      if (el instanceof HTMLElement && el !== exclude) before.set(el, el.getBoundingClientRect());
    }
  }
  for (const el of before.keys()) {
    el.getAnimations().forEach((a) => a.id === "slide" && a.cancel());
  }
  change();
  const duration = motionMs(260);
  for (const [el, from] of before) {
    const wasHidden = !from.width && !from.height;
    if (wasHidden || !el.isConnected || !isShown(el)) continue;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      id: "slide",
      duration,
      easing: SETTLE_EASE,
    });
  }
}

function makePlaceholder(node: BookmarkNode, forBar: boolean): HTMLElement {
  let el: HTMLElement;
  if (!forBar) el = createDropdownEntry(node);
  else if (isFolder(node)) el = createTopLevelFolder(node);
  else el = createBookmarkLink(node);
  el.querySelectorAll(".folder-dropdown").forEach((menu) => menu.remove());
  el.removeAttribute("data-item-id");
  el.removeAttribute("data-bookmark-id");
  el.querySelectorAll("[data-bookmark-id]").forEach((n) => n.removeAttribute("data-bookmark-id"));
  el.classList.add("drag-placeholder");
  el.dataset.forBar = String(forBar);
  el.inert = true;
  return el;
}

function insertAtSlot(list: HTMLElement, index: number, el: HTMLElement, d: ActiveDrag): void {
  const same = sameKindItems(list, d);
  if (index < same.length) {
    same[index]!.before(el);
  } else if (same.length) {
    same[same.length - 1]!.after(el);
  } else {
    const others = otherKindItems(list, d);
    if (d.folder && others.length) others[0]!.before(el);
    else if (!d.folder && others.length) others[others.length - 1]!.after(el);
    else list.prepend(el);
  }
}

function placeholderSlotIndex(list: HTMLElement, d: ActiveDrag): number {
  return sameKindItems(list, d).filter(
    (el) => d.placeholder!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING
  ).length;
}

function popIn(el: HTMLElement): void {
  el.animate(
    [
      { opacity: 0, transform: "scale(0.6)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: motionMs(220), easing: SETTLE_EASE }
  );
}

// A gap that leaves the bar stays behind as an empty spacer until the drop:
// a centred bar would otherwise re-centre and slide the folder under the
// pointer away.
function vacate(d: ActiveDrag, gap: HTMLElement | null): void {
  if (gap?.parentElement !== getBar()) {
    gap?.remove();
    return;
  }
  gap.classList.add("drag-spacer");
  d.barSpacer = gap;
}

function removeSpacer(d: ActiveDrag): void {
  d.barSpacer?.remove();
  d.barSpacer = null;
}

function moveSlot(d: ActiveDrag, list: HTMLElement, index: number): void {
  const forBar = list === getBar();
  const current = d.placeholder;
  const sameList = !!current && current.parentElement === list && current.dataset.forBar === String(forBar);
  if (sameList && placeholderSlotIndex(list, d) === index) return;
  const reused = sameList ? current : forBar ? d.barSpacer : null;
  const placeholder = reused ?? makePlaceholder(d.node, forBar);
  slideItems(
    [current?.parentElement, list],
    () => {
      if (placeholder !== current) vacate(d, current);
      if (placeholder === d.barSpacer) {
        placeholder.classList.remove("drag-spacer");
        d.barSpacer = null;
      }
      insertAtSlot(list, index, placeholder, d);
    },
    reused ? undefined : placeholder
  );
  if (!reused) popIn(placeholder);
  d.placeholder = placeholder;
}

function removePlaceholder(d: ActiveDrag): void {
  const placeholder = d.placeholder;
  if (!placeholder) return;
  slideItems([placeholder.parentElement], () => vacate(d, placeholder));
  d.placeholder = null;
}

function isOpenFolder(trigger: HTMLElement): boolean {
  return !!trigger.parentElement?.matches(".open, .submenu-open");
}

function springOpen(trigger: HTMLElement): void {
  const wrapper = trigger.parentElement!;
  openFolder(trigger);
  wrapper.classList.add("spring-opened");
}

function setSpringTarget(d: ActiveDrag, trigger: HTMLElement | null): void {
  if (trigger === d.springTarget) return;
  d.springTarget?.classList.remove("drop-into");
  clearTimeout(d.springTimer);
  d.springTarget = trigger;
  if (!trigger) return;
  trigger.classList.add("drop-into");
  if (!isOpenFolder(trigger)) {
    d.springTimer = setTimeout(() => springOpen(trigger), SPRING_OPEN_MS);
  }
}

// Folders that are open but no longer around the pointer or the drop target
// close after a short grace, so crossing a gap doesn't snap a menu shut.
function staleOpenFolders(d: ActiveDrag, hit: Element | null): Element[] {
  const anchor = d.target?.kind === "into" ? d.target.trigger : d.target?.list;
  return Array.from(getBar().querySelectorAll(".bookmark-folder.open, .has-submenu.submenu-open")).filter(
    (wrapper) => !(hit && wrapper.contains(hit)) && !(anchor && wrapper.contains(anchor))
  );
}

function scheduleStaleClose(d: ActiveDrag, hit: Element | null): void {
  if (!staleOpenFolders(d, hit).length) {
    clearTimeout(d.staleTimer);
    d.staleTimer = undefined;
    return;
  }
  if (d.staleTimer !== undefined) return;
  d.staleTimer = setTimeout(() => {
    d.staleTimer = undefined;
    if (drag !== d) return;
    staleOpenFolders(d, document.elementFromPoint(d.x, d.y)).forEach(closeFolder);
  }, STALE_FOLDER_CLOSE_MS);
}

function updateTarget(d: ActiveDrag): void {
  const hit = document.elementFromPoint(d.x, d.y);
  const target = findTarget(d, hit);
  if (target?.kind === "slot") {
    setSpringTarget(d, null);
    moveSlot(d, target.list, target.index);
  } else if (target?.kind === "into") {
    // The gap stays put: closing it would slide the folder out from under
    // the pointer and flip the target back to a slot.
    setSpringTarget(d, target.trigger);
  } else {
    setSpringTarget(d, null);
    removePlaceholder(d);
  }
  d.target = target;
  scheduleStaleClose(d, hit);
}

function positionGhost(d: ActiveDrag): void {
  d.ghost.style.transform = `translate3d(${d.x - d.grabX}px, ${d.y - d.grabY}px, 0)`;
}

function frame(d: ActiveDrag): void {
  const velocityX = d.x - d.lastFrameX;
  d.lastFrameX = d.x;
  const lean = Math.max(-12, Math.min(12, velocityX * 0.7));
  d.tilt += (lean - d.tilt) * 0.2;
  positionGhost(d);
  d.ghost.style.setProperty("--tilt", `${d.tilt.toFixed(2)}deg`);
  updateTarget(d);
  d.frame = requestAnimationFrame(() => frame(d));
}

function buildGhost(handle: HTMLElement): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  const chip = document.createElement("div");
  chip.className = "drag-ghost-chip";
  for (const child of handle.childNodes) chip.append(child.cloneNode(true));
  chip.querySelectorAll(".chevron, .folder-caret").forEach((el) => el.remove());
  ghost.append(chip);
  return ghost;
}

function iconCenter(el: Element): { x: number; y: number } {
  const icon = el.querySelector(ICON_SELECTOR) ?? el;
  const r = icon.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function startDrag(p: PendingDrag, x: number, y: number): void {
  holdRendering();
  window.getSelection()?.removeAllRanges();
  pinOpenPath(p.source);
  getBar().classList.add("dragging");

  const handleRect = p.handle.getBoundingClientRect();
  const ghost = buildGhost(p.handle);
  ghost.style.transform = `translate3d(${handleRect.left}px, ${handleRect.top}px, 0)`;
  document.body.append(ghost);
  const ghostRect = ghost.getBoundingClientRect();
  const icon = iconCenter(ghost);

  const folder = isFolder(p.node);
  const d: ActiveDrag = {
    ...p,
    folder,
    ghost,
    ghostIconOffset: { x: icon.x - ghostRect.left, y: icon.y - ghostRect.top },
    grabX: Math.min(p.startX - handleRect.left, ghostRect.width - 8),
    grabY: Math.min(p.startY - handleRect.top, ghostRect.height - 4),
    x,
    y,
    lastFrameX: x,
    tilt: 0,
    frame: 0,
    placeholder: null,
    barSpacer: null,
    target: null,
    springTarget: null,
  };
  drag = d;

  const placeholder = makePlaceholder(p.node, p.source.parentElement === getBar());
  p.source.before(placeholder);
  p.source.classList.add("drag-source");
  d.placeholder = placeholder;

  requestAnimationFrame(() => ghost.classList.add("lifted"));
  d.frame = requestAnimationFrame(() => frame(d));
  window.addEventListener("keydown", onDragKeydown, true);
  window.addEventListener("blur", cancelDrag);
}

function finalIndex(parentId: string, d: ActiveDrag): number {
  const siblings = (getBookmarkNode(parentId)?.children ?? []).filter((c) => c.id !== d.node.id);
  const list = d.placeholder!.parentElement!;
  const same = sameKindItems(list, d);
  const following = (el: HTMLElement) =>
    !!(d.placeholder!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const next = same.find(following);
  const prev = same.filter((el) => !following(el)).pop();
  if (next) return siblings.findIndex((c) => c.id === next.dataset.itemId);
  if (prev) return siblings.findIndex((c) => c.id === prev.dataset.itemId) + 1;
  return d.folder ? 0 : siblings.length;
}

function isNoOpMove(d: ActiveDrag, parentId: string, index: number): boolean {
  const current = (getBookmarkNode(parentId)?.children ?? []).findIndex((c) => c.id === d.node.id);
  return current !== -1 && current === index;
}

function flyGhost(d: ActiveDrag, to: { x: number; y: number }, vanish: boolean): Promise<void> {
  d.ghost.classList.remove("lifted");
  d.ghost.classList.toggle("vanishing", vanish);
  d.ghost.style.setProperty("--tilt", "0deg");
  const left = to.x - d.ghostIconOffset.x;
  const top = to.y - d.ghostIconOffset.y;
  const flight = d.ghost.animate(
    [{ transform: d.ghost.style.transform }, { transform: `translate3d(${left}px, ${top}px, 0)` }],
    { duration: motionMs(vanish ? 240 : 280), easing: vanish ? "cubic-bezier(0.5, 0, 0.75, 0)" : SETTLE_EASE, fill: "forwards" }
  );
  return flight.finished.then(() => undefined);
}

function bounceIcon(trigger: HTMLElement): Promise<void> {
  const icon = trigger.querySelector<HTMLElement>(ICON_SELECTOR) ?? trigger;
  return icon
    .animate([{ scale: "1" }, { scale: "1.45" }, { scale: "0.92" }, { scale: "1" }], {
      duration: motionMs(380),
      easing: "ease-out",
    })
    .finished.then(() => undefined);
}

function stopTracking(d: ActiveDrag): void {
  cancelAnimationFrame(d.frame);
  clearTimeout(d.springTimer);
  clearTimeout(d.staleTimer);
  d.springTarget?.classList.remove("drop-into");
  window.removeEventListener("keydown", onDragKeydown, true);
  window.removeEventListener("blur", cancelDrag);
  drag = null;
  settling = true;
}

function fadeOutGhost(d: ActiveDrag): void {
  const fade = d.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: motionMs(140), fill: "forwards" });
  void fade.finished.then(() => d.ghost.remove());
}

function finishDrag(d: ActiveDrag): void {
  fadeOutGhost(d);
  getBar().classList.remove("dragging");
  document.querySelectorAll(".spring-opened").forEach((el) => el.classList.remove("spring-opened"));
}

function settle(): void {
  settling = false;
  releaseRendering();
}

async function commitMove(id: string, parentId: string, index?: number): Promise<void> {
  try {
    await getPlatform().bookmarks.move(id, parentId, index);
    settle();
  } catch (err) {
    console.error("Failed to move bookmark", err);
    settle();
    void renderBookmarks();
  }
}

async function dropIntoFolder(d: ActiveDrag, trigger: HTMLElement, parentId: string): Promise<void> {
  await flyGhost(d, iconCenter(trigger), true);
  const placeholder = d.placeholder;
  slideItems([placeholder?.parentElement, d.barSpacer?.parentElement], () => {
    placeholder?.remove();
    removeSpacer(d);
  });
  d.source.remove();
  finishDrag(d);
  await bounceIcon(trigger);
  await commitMove(d.node.id, parentId);
}

async function dropInSlot(d: ActiveDrag, placeholder: HTMLElement): Promise<void> {
  const parentId = placeholder.parentElement!.dataset.parentId!;
  const index = finalIndex(parentId, d);
  const noOp = getBookmarkNode(d.node.id)?.parentId === parentId && isNoOpMove(d, parentId, index);
  await flyGhost(d, iconCenter(placeholder), false);
  if (placeholder.dataset.forBar === String(d.source.parentElement === getBar())) {
    placeholder.replaceWith(d.source);
    d.source.classList.remove("drag-source");
  } else {
    d.source.remove();
    placeholder.classList.remove("drag-placeholder");
    placeholder.inert = false;
  }
  if (d.barSpacer) slideItems([getBar()], () => removeSpacer(d));
  finishDrag(d);
  if (noOp) settle();
  else await commitMove(d.node.id, parentId, index);
}

function cancelDrag(): void {
  const d = drag;
  if (!d) return;
  stopTracking(d);
  const placeholder = d.placeholder;
  slideItems([placeholder?.parentElement, d.barSpacer?.parentElement, d.source.parentElement], () => {
    placeholder?.remove();
    removeSpacer(d);
    d.source.classList.remove("drag-source");
  });
  const sourceVisible = isShown(d.source);
  const flight = sourceVisible ? flyGhost(d, iconCenter(d.source), false) : Promise.resolve();
  if (!sourceVisible) d.ghost.classList.add("vanishing");
  void flight.then(() => {
    finishDrag(d);
    settle();
  });
}

function drop(): void {
  const d = drag;
  if (!d) return;
  updateTarget(d);
  const { target, placeholder } = d;
  if (!target || (target.kind === "slot" && !placeholder)) {
    cancelDrag();
    return;
  }
  stopTracking(d);
  staleOpenFolders(d, document.elementFromPoint(d.x, d.y)).forEach(closeFolder);
  if (target.kind === "into") void dropIntoFolder(d, target.trigger, target.parentId);
  else void dropInSlot(d, placeholder!);
}

function swallowNextClick(): void {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

function onDragKeydown(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  cancelDrag();
}

function stopListening(): void {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
}

function onPointerMove(e: PointerEvent): void {
  if (drag) {
    drag.x = e.clientX;
    drag.y = e.clientY;
    return;
  }
  if (!pending) return;
  if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < DRAG_THRESHOLD_PX) return;
  const p = pending;
  pending = null;
  startDrag(p, e.clientX, e.clientY);
}

function onPointerUp(): void {
  stopListening();
  pending = null;
  if (!drag) return;
  swallowNextClick();
  drop();
}

function onPointerCancel(): void {
  stopListening();
  pending = null;
  cancelDrag();
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || !e.isPrimary || e.ctrlKey || drag || settling) return;
  const handle = (e.target as Element).closest<HTMLElement>("[data-bookmark-id]");
  const source = handle?.closest<HTMLElement>("[data-item-id]");
  const node = handle && getBookmarkNode(handle.dataset.bookmarkId!);
  if (!handle || !source || !node) return;
  pending = { handle, source, node, startX: e.clientX, startY: e.clientY };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
}

export function setupBookmarkDrag(): void {
  const bar = document.getElementById("bookmarks-bar");
  if (!bar) return;
  // Links and favicons are natively draggable; that drag would fight this one.
  bar.addEventListener("dragstart", (e) => e.preventDefault());
  bar.addEventListener("pointerdown", onPointerDown);
}
