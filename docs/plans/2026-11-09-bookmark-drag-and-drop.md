# Bookmark drag and drop, context-menu fixes, Node 24

> Drag bookmarks and folders to reorder them or move them between the bar and any folder, with sliding items, a lifted glass chip and spring-loaded folders. Fixes two submenu bugs (right-click and cmd-click closed the menu) and moves the toolchain to Node 24.

**Status:** Built · **Date:** 2026-11-09 · **Scope:** shared + both platform shims + build config

## What changes

1. **Drag and drop (`bookmark-drag.ts`).** Press on any bookmark or folder in the bar, its dropdowns or the overflow menu and move 5px to pick it up. The item becomes a glass chip that lifts (scale and shadow) and leans with horizontal speed. Where it would land, a breathing accent slot opens and the other items slide apart (FLIP with the Web Animations API). Dropping flies the chip into the slot so its icon lands on the item's icon, then crossfades. Escape, a drop away from the bar and menus, or losing window focus flies it back home.
2. **Folders-first is respected.** The bar and menus sort folders before links, so a folder only reorders among folders and a link among links. Over a folder, a link always drops *into* it; a folder drops in only over the middle half, and reorders at the edges. A folder never drops into itself or a descendant. While a folder is the target the slot stays where it was, so the target doesn't slide out from under the pointer.
3. **Spring-loaded folders.** Holding over a folder for 550ms opens it (its icon swells while it charges); this works for bar folders, nested submenus and the overflow chevron, which drops at the end of the toolbar. Menus no longer around the pointer close after a 450ms grace. During a drag, submenus open only this way, not on hover. Dropping on a closed folder shrinks the chip into its icon, which bounces.
4. **Writes.** New `Platform.bookmarks.move(id, parentId, index?)` where `index` is the final position. Firefox already means that (checked in Firefox: moving A to 2 in ABCD gives BCAD). Chrome reads the index before removing the node, so its shim adds one for moves further down the same folder. The index is derived from the nearest same-kind neighbours of the slot, so hidden separators and overflowed items stay in place. Same-position drops write nothing.
5. **Rendering during a drag.** Re-renders and overflow reflows are held while dragging and run once afterwards, and the DOM is updated optimistically on drop so the re-render is invisible. Re-renders now build after their awaits (no interleaving) and reopen whichever folders and submenus were open, so a rename, delete or move doesn't close the menu you're working in.
6. **Right-click in a submenu kept the menu open.** The context menu now closes everything except the path to the item, pins hover-opened submenus around it, and keeps the item lit until its menu or dialog is done. Clicks in the menu or dialog, and Escape inside the dialog, no longer close the dropdowns. Any press outside the context menu closes it (capture phase, since folder buttons stop their clicks).
7. **Cmd/Ctrl-click in a menu keeps it open**, so several links can be opened in background tabs in a row.
8. **Node 24.** `.nvmrc`, `engines` and `@types/node` move to 24. Node 24 strips TypeScript types natively, so `tsx` is dropped and the builds run as `node build.ts` (the platform packages are now `"type": "module"`; `tsconfig.scripts.json` adds `erasableSyntaxOnly` so `tsc` rejects syntax Node can't strip).

## Decisions

> **✓ Pointer events, not HTML5 drag and drop** — native DnD gives a static, translucent drag image and no `:hover`, so neither the lifted chip nor spring-loading could be done well. Trade-off: bar links can no longer be dragged out of the page (e.g. onto the tab strip).

> **✓ Slot follows folders-first** — the alternative, letting links sit between folders, would be undone by the next render's sort.

> **✓ No keyboard reordering yet** — rename/delete stay the keyboard path; a "Move…" menu item can come later.

## Later decisions

> **2026-11-09 · The bar keeps its gap until the drop.** Once the gap leaves the bar (into a folder's menu, or with the pointer away from the bar), it stays behind as an invisible spacer and comes back as the gap if the item returns. When bookmarks are centred, or overflow the bar's minimum width, closing it re-centred the bar and slid the folder under the pointer, and its open menu, away. The spacer collapses with the usual slide on drop or cancel. Adds to item 1.

## Verification

- `npm run typecheck` and `npm run build` pass on Node 24 (`web-ext lint` could not run inside the sandbox).
- In Firefox, against an in-memory bookmark tree: reorder in the bar; bar → nested subfolder via two spring-loads; downward move within a folder; menu → bar; folder into folder (stable target); Escape cancel; bottom position with upward menus; rename with the submenu kept open; cmd/ctrl-click keeps the menu, a plain click closes it; pressing another menu row closes the context menu.
- Firefox `bookmarks.move` index rule checked with a throwaway extension.
- Same flows in Chrome (DevTools MCP) against a fake `chrome.bookmarks` that follows Chromium's move rule: moves down and up within a folder land where dropped, and the glass chip renders with real blur. The real extension couldn't be loaded there (`chrome://` pages are off-limits to DevTools automation).
- Frame rate in Firefox with a wallpaper: about 20fps at first, because `updateInk` rewrote an unchanged `data-ink` on `<html>`, which re-triggered the backdrop observer and re-blurred the clock every frame, idle or not (already in 1.14.1). Writing `data-ink` only when it changes, and putting the `dragging` class on the bar instead of `<body>` so a lift doesn't wake that observer, brings drags to a steady 60fps. Only the first lift after load drops a frame.
- Centred bar: the hovered folder stays put while the gap moves into its menu, leaves the bar, or returns; drops and Escape leave no spacer behind.
