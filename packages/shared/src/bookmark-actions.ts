import { getPlatform, type BookmarkNode } from "@/platform";
import { getBookmarkNode, isFolder, closeAllDropdowns } from "@/bookmarks";
import { t } from "@/i18n";
import { clearFolderEmoji, dismissEmptyBarNotice } from "@/settings";

interface DialogOptions {
  title: string;
  description?: string;
  inputValue?: string;
  confirmLabel: string;
  danger?: boolean;
}

// Resolves with the input's value on confirm (or "" when there is no input),
// null on cancel/Escape. Native <dialog> gives us the focus trap and backdrop.
function openDialog(opts: DialogOptions): Promise<string | null> {
  const dialog = document.getElementById("bookmark-dialog") as HTMLDialogElement;
  const title = document.getElementById("bookmark-dialog-title")!;
  const desc = document.getElementById("bookmark-dialog-desc")!;
  const input = document.getElementById("bookmark-dialog-input") as HTMLInputElement;
  const confirm = document.getElementById("bookmark-dialog-confirm")!;

  title.textContent = opts.title;
  desc.textContent = opts.description ?? "";
  desc.hidden = !opts.description;
  input.hidden = opts.inputValue === undefined;
  input.value = opts.inputValue ?? "";
  confirm.textContent = opts.confirmLabel;
  confirm.classList.toggle("danger", !!opts.danger);

  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "ok" ? input.value : null),
      { once: true }
    );
    dialog.returnValue = "";
    dialog.showModal();
    if (!input.hidden) input.select();
  });
}

function countTree(node: BookmarkNode): { bookmarks: number; folders: number } {
  let bookmarks = 0;
  let folders = 0;
  for (const child of node.children ?? []) {
    if (isFolder(child)) {
      folders += 1;
      const nested = countTree(child);
      bookmarks += nested.bookmarks;
      folders += nested.folders;
    } else {
      bookmarks += 1;
    }
  }
  return { bookmarks, folders };
}

function displayName(node: BookmarkNode): string {
  return node.title || (isFolder(node) ? t("unnamedFolder") : node.url || "");
}

async function renameBookmark(node: BookmarkNode): Promise<void> {
  const title = await openDialog({
    title: t(isFolder(node) ? "renameFolderTitle" : "renameBookmarkTitle"),
    inputValue: node.title,
    confirmLabel: t("dialogSave"),
  });
  if (title === null || title.trim() === node.title) return;
  await getPlatform().bookmarks.rename(node.id, title.trim());
}

async function deleteBookmark(node: BookmarkNode): Promise<void> {
  const folder = isFolder(node);
  const { bookmarks, folders } = folder ? countTree(node) : { bookmarks: 0, folders: 0 };
  const description = !folder
    ? t("deleteBookmarkDescription")
    : bookmarks + folders === 0
      ? t("deleteEmptyFolderDescription")
      : t("deleteFolderDescription")
          .replace("{bookmarks}", String(bookmarks))
          .replace("{folders}", String(folders));
  const confirmed = await openDialog({
    title: t(folder ? "deleteFolderTitle" : "deleteBookmarkTitle").replace(
      "{name}",
      displayName(node)
    ),
    description,
    confirmLabel: t("dialogDelete"),
    danger: true,
  });
  if (confirmed === null) return;
  const api = getPlatform().bookmarks;
  if (folder) {
    await api.removeTree(node.id);
    await clearFolderEmoji(node.id);
  } else {
    await api.remove(node.id);
  }
}

function placeMenu(menu: HTMLElement, x: number, y: number): void {
  menu.hidden = false;
  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - height - 8)}px`;
}

export function setupBookmarkActions(): void {
  const bar = document.getElementById("bookmarks-bar");
  const menu = document.getElementById("bookmark-menu");
  const renameBtn = document.getElementById("bookmark-menu-rename");
  const deleteBtn = document.getElementById("bookmark-menu-delete");
  const noticeDismiss = document.getElementById("empty-bar-notice-dismiss");
  if (!bar || !menu || !renameBtn || !deleteBtn) return;

  let target: BookmarkNode | null = null;
  const hideMenu = () => {
    menu.hidden = true;
  };

  bar.addEventListener("contextmenu", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-bookmark-id]");
    const node = el && getBookmarkNode(el.dataset.bookmarkId!);
    if (!el || !node) return;
    e.preventDefault();
    e.stopPropagation();
    target = node;
    closeAllDropdowns();
    // Keyboard-invoked (Shift+F10 / Menu key) reports 0,0: anchor to the item.
    const rect = el.getBoundingClientRect();
    const fromKeyboard = e.clientX === 0 && e.clientY === 0;
    placeMenu(menu, fromKeyboard ? rect.left : e.clientX, fromKeyboard ? rect.bottom : e.clientY);
    renameBtn.focus();
  });

  renameBtn.addEventListener("click", () => {
    hideMenu();
    if (target) void renameBookmark(target).catch(console.error);
  });
  deleteBtn.addEventListener("click", () => {
    hideMenu();
    if (target) void deleteBookmark(target).catch(console.error);
  });

  document.addEventListener("click", hideMenu);
  document.addEventListener("contextmenu", hideMenu);
  window.addEventListener("resize", hideMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideMenu();
  });

  noticeDismiss?.addEventListener("click", () => {
    const notice = document.getElementById("empty-bar-notice");
    if (notice) notice.hidden = true;
    void dismissEmptyBarNotice();
  });
}
