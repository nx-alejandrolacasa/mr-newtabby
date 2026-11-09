import { setPlatform, type Platform } from "@/platform";
import { applyI18n } from "@/i18n";
import {
  renderBookmarks,
  setupBookmarksListeners,
  closeAllDropdowns,
  opensInBackground,
} from "@/bookmarks";
import { setupBookmarkDrag } from "@/bookmark-drag";
import { loadBackground, updateBackgroundErrorVisibility } from "@/unsplash";
import {
  loadSettings,
  applyTheme,
  applyStyle,
  applyBookmarksPosition,
  applyCenterWidget,
  applyClockSize,
  applyGlassLevel,
  applyClassSettings,
  syncSettingsUi,
  setupSettingsPanel,
  setupBackoffStorageListener,
  setupFolderEmojiStorageListener,
  getSettings,
} from "@/settings";
import { setupFolderEmojiOverlay } from "@/folder-emojis";
import { setupBookmarkActions } from "@/bookmark-actions";
import { setupInk } from "@/ink";
import { setupSearch } from "@/search";
import { setupTabGroups, setupTabGroupsStorageListener } from "@/tab-groups-bar";

export async function startApp(platform: Platform): Promise<void> {
  setPlatform(platform);

  document.addEventListener("click", (e) => {
    if (!opensInBackground(e)) closeAllDropdowns();
  });
  document.addEventListener("keydown", (e) => {
    // Escape in a dialog only closes the dialog.
    if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
      closeAllDropdowns();
      const panel = document.getElementById("settings-panel");
      const btn = document.getElementById("settings-btn");
      if (panel && !panel.hidden) {
        panel.hidden = true;
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    }
  });

  applyI18n();
  await loadSettings();
  const settings = getSettings();

  applyTheme();
  applyStyle();
  applyBookmarksPosition();
  applyClassSettings();
  syncSettingsUi();
  setupSettingsPanel();
  setupFolderEmojiOverlay();
  setupSearch();
  applyCenterWidget();
  applyClockSize();
  applyGlassLevel();
  setupBookmarksListeners();
  setupBookmarkActions();
  setupBookmarkDrag();
  setupInk();
  setupBackoffStorageListener();
  setupFolderEmojiStorageListener();
  setupTabGroupsStorageListener();

  renderBookmarks();
  void setupTabGroups();
  loadBackground({
    enabled: settings.backgroundEnabled,
    intervalHours: settings.backgroundIntervalHours,
  });
  updateBackgroundErrorVisibility({
    enabled: settings.backgroundEnabled,
    intervalHours: settings.backgroundIntervalHours,
  });
}
