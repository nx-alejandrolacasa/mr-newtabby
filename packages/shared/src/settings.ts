import { getPlatform } from "@/platform";
import { scheduleReflow, renderBookmarks } from "@/bookmarks";
import { loadBackground, updateBackgroundErrorVisibility } from "@/unsplash";
import { focusSearch } from "@/search";
import { startClock, stopClock } from "@/clock";
import { TAB_GROUP_PERMISSIONS } from "@/tab-groups-store";
import { renderTabGroups } from "@/tab-groups-bar";

export const SETTINGS_DEFAULTS = {
  centerBookmarks: false,
  hideLabels: false,
  backgroundEnabled: true,
  backgroundIntervalHours: 6,
  theme: "auto" as "auto" | "light" | "dark",
  style: "glass" as "glass" | "classic",
  // Glass tint in seven stops, 0 = clear … 6 = fully tinted (the iOS 27
  // Liquid Glass slider).
  glassLevel: 3,
  bookmarksPosition: "top" as "top" | "bottom",
  // Which widget occupies the centered slot in #content.
  centerWidget: "clock" as "search" | "clock" | "none",
  // Clock size as a percentage of the responsive base (100 = base). Scales the
  // clamp() in CSS via the --clock-scale custom property.
  clockSize: 110,
  // Maps a top-level folder id to a chosen emoji that replaces its icon.
  folderEmojis: {} as Record<string, string>,
  // When on, Mr. Newtabby watches native tab groups and lists closed ones in the
  // bar for one-click reopen. Off by default; enabling requests tabs+tabGroups.
  tabGroupsEnabled: false,
  // Whether the user dismissed the explanatory tip at the foot of the groups menu.
  tabGroupsTipDismissed: false,
  // Whether the user dismissed the one-time "bar hidden because it's empty" notice.
  emptyBarNoticeDismissed: false,
};

export type Settings = typeof SETTINGS_DEFAULTS;

const systemDarkMq = window.matchMedia("(prefers-color-scheme: dark)");

let settings: Settings = { ...SETTINGS_DEFAULTS };

export function getSettings(): Readonly<Settings> {
  return settings;
}

// Extension storage takes hundreds of milliseconds to answer a new tab's first
// read, so startup uses this localStorage copy and only falls back to storage
// when it is missing.
const MIRROR_KEY = "settings";

function readMirror(): Partial<Settings> | null {
  try {
    return JSON.parse(localStorage.getItem(MIRROR_KEY) ?? "null");
  } catch {
    return null;
  }
}

// Merges rather than overwrites, so a tab holding stale settings in memory
// cannot undo a change saved from another tab.
function mirror(values: Partial<Settings>): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ ...(readMirror() ?? settings), ...values }));
  } catch {
    /* ignore */
  }
}

async function readStoredSettings(): Promise<Settings> {
  const stored = await getPlatform().storage.get(SETTINGS_DEFAULTS as any);
  const result = { ...SETTINGS_DEFAULTS, ...(stored as Partial<Settings>) };

  // Migrate the legacy `showSearch` boolean → `centerWidget`. The array-form
  // read distinguishes "never stored" from the default, so an explicit
  // centerWidget always wins; an unset legacy key falls through to the new
  // "clock" default ("clock for everyone").
  const raw = await getPlatform().storage.get(["centerWidget", "showSearch"]);
  if ((raw as { centerWidget?: unknown }).centerWidget === undefined) {
    const showSearch = (raw as { showSearch?: boolean }).showSearch;
    if (showSearch === false) result.centerWidget = "none";
    else if (showSearch === true) result.centerWidget = "search";
  }
  mirror(result);
  return result;
}

export async function loadSettings(): Promise<void> {
  const mirrored = readMirror();
  settings = mirrored ? { ...SETTINGS_DEFAULTS, ...mirrored } : await readStoredSettings();
  if (!Number.isInteger(settings.glassLevel) || settings.glassLevel < 0 || settings.glassLevel > 6) {
    settings.glassLevel = SETTINGS_DEFAULTS.glassLevel;
  }
}

async function persist(values: Partial<Settings>): Promise<void> {
  Object.assign(settings, values);
  mirror(values);
  await getPlatform().storage.set(values);
}

async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await persist({ [key]: value });
}

function effectiveTheme(): "light" | "dark" {
  if (settings.theme === "light" || settings.theme === "dark") return settings.theme;
  return systemDarkMq.matches ? "dark" : "light";
}

export function applyClassSettings(): void {
  document.body.classList.toggle("centered", settings.centerBookmarks);
  document.body.classList.toggle("hide-labels", settings.hideLabels);
}

export function getFolderEmoji(id: string): string | undefined {
  return settings.folderEmojis[id];
}

export async function setFolderEmoji(id: string, emoji: string): Promise<void> {
  await persist({ folderEmojis: { ...settings.folderEmojis, [id]: emoji } });
}

export async function clearFolderEmoji(id: string): Promise<void> {
  if (!(id in settings.folderEmojis)) return;
  const next = { ...settings.folderEmojis };
  delete next[id];
  await persist({ folderEmojis: next });
}

export function applyTheme(): void {
  document.documentElement.dataset.theme = effectiveTheme();
  try {
    localStorage.setItem("theme", settings.theme);
  } catch {
    /* ignore */
  }
}

export function applyStyle(): void {
  document.documentElement.dataset.style = settings.style;
  try {
    localStorage.setItem("style", settings.style);
  } catch {
    /* ignore */
  }
}

export function applyBookmarksPosition(): void {
  document.documentElement.dataset.bookmarksPosition = settings.bookmarksPosition;
  try {
    localStorage.setItem("bookmarksPosition", settings.bookmarksPosition);
  } catch {
    /* ignore */
  }
}

export function applyCenterWidget(): void {
  const widget = settings.centerWidget;
  // Mirror the theme/style/position pattern: a data attribute on <html> that
  // CSS keys off (and theme-init reads from localStorage to avoid a flash).
  document.documentElement.dataset.centerWidget = widget;
  try {
    localStorage.setItem("centerWidget", widget);
  } catch {
    /* ignore */
  }
  if (widget === "clock") startClock();
  else stopClock();
  if (widget === "search") focusSearch();
}

export function applyClockSize(): void {
  setClockScale(settings.clockSize);
}

export function applyGlassLevel(): void {
  setGlassLevel(settings.glassLevel);
}

// Side effects of toggling tab groups. The optional-permission REQUEST is NOT
// here — Firefox rejects permissions.request() unless it's called synchronously
// within the user gesture, so the request runs directly in the checkbox change
// handler (see setupSettingsPanel) before any await. Here we only relinquish on
// disable and re-render. The snapshot archive in storage is kept (manual purge).
export async function applyTabGroupsEnabled(): Promise<void> {
  if (!settings.tabGroupsEnabled) {
    await getPlatform().permissions?.remove([...TAB_GROUP_PERMISSIONS]);
  }
  await renderTabGroups();
}

// Persist that the user dismissed the groups-menu tip so it stays hidden.
export async function dismissTabGroupsTip(): Promise<void> {
  await persist({ tabGroupsTipDismissed: true });
}

export async function dismissEmptyBarNotice(): Promise<void> {
  await persist({ emptyBarNoticeDismissed: true });
}

// Single place that writes the --clock-scale custom property (and mirrors it to
// localStorage so theme-init can set it before first paint, avoiding a size
// jump). Used both for the persisted value and for live drag previews.
function setClockScale(percent: number): void {
  document.documentElement.style.setProperty("--clock-scale", String(percent / 100));
  try {
    localStorage.setItem("clockSize", String(percent));
  } catch {
    /* ignore */
  }
}

function setGlassLevel(stop: number): void {
  document.documentElement.style.setProperty("--glass-level", String(stop / 6));
  try {
    localStorage.setItem("glassLevel", String(stop));
  } catch {
    /* ignore */
  }
}

// Sliders preview live while dragging (cheap CSS var write, no storage churn).
const SLIDER_PREVIEW: Partial<Record<keyof Settings, (percent: number) => void>> = {
  clockSize: setClockScale,
  glassLevel: setGlassLevel,
};

export function syncSettingsUi(): void {
  document.querySelectorAll<HTMLElement>("[data-setting]").forEach((el) => {
    const key = el.dataset.setting as keyof Settings | undefined;
    if (!key || !(key in settings)) return;
    if (el.classList.contains("toggle-group")) {
      el.querySelectorAll<HTMLButtonElement>("button[data-value]").forEach((btn) => {
        btn.setAttribute(
          "aria-checked",
          String(btn.dataset.value === String(settings[key]))
        );
      });
    } else if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = !!settings[key];
    } else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      el.value = String(settings[key]);
    }
  });
}

function handleSettingChange(key: keyof Settings): void {
  if (key === "centerBookmarks") {
    applyClassSettings();
  } else if (key === "hideLabels") {
    applyClassSettings();
    scheduleReflow();
  } else if (key === "theme") {
    applyTheme();
  } else if (key === "style") {
    applyStyle();
  } else if (key === "bookmarksPosition") {
    applyBookmarksPosition();
    scheduleReflow();
  } else if (key === "backgroundEnabled" || key === "backgroundIntervalHours") {
    loadBackground({
      enabled: settings.backgroundEnabled,
      intervalHours: settings.backgroundIntervalHours,
    });
    if (key === "backgroundEnabled") {
      updateBackgroundErrorVisibility({
        enabled: settings.backgroundEnabled,
        intervalHours: settings.backgroundIntervalHours,
      });
    }
  } else if (key === "centerWidget") {
    applyCenterWidget();
  } else if (key === "clockSize") {
    applyClockSize();
  } else if (key === "glassLevel") {
    applyGlassLevel();
  } else if (key === "tabGroupsEnabled") {
    void applyTabGroupsEnabled();
  }
}

export function setupSettingsPanel(): void {
  const btn = document.getElementById("settings-btn") as HTMLButtonElement | null;
  const panel = document.getElementById("settings-panel");
  if (!btn || !panel) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      updateBackgroundErrorVisibility({
        enabled: settings.backgroundEnabled,
        intervalHours: settings.backgroundIntervalHours,
      });
    }
  });

  panel.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", () => {
    if (!panel.hidden) {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  });

  panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-setting]').forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.setting as keyof Settings;
      // Tab groups needs its optional permissions, and Firefox only allows
      // permissions.request() to run synchronously inside the user gesture —
      // i.e. BEFORE any await in this handler. Request first; revert on decline
      // (resolves false) OR on error (rejects), so the toggle never sticks on
      // without the grant.
      if (key === "tabGroupsEnabled" && input.checked) {
        const api = getPlatform().permissions;
        let granted = !api;
        if (api) {
          try {
            granted = await api.request([...TAB_GROUP_PERMISSIONS]);
          } catch {
            granted = false;
          }
        }
        if (!granted) {
          input.checked = false;
          return;
        }
      }
      await saveSetting(key, input.checked as Settings[typeof key]);
      handleSettingChange(key);
    });
  });

  panel.querySelectorAll<HTMLSelectElement>("select[data-setting]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const key = sel.dataset.setting as keyof Settings;
      const value =
        key === "backgroundIntervalHours" ? parseInt(sel.value, 10) : (sel.value as Settings[typeof key]);
      await saveSetting(key, value as Settings[typeof key]);
      handleSettingChange(key);
    });
  });

  panel.querySelectorAll<HTMLInputElement>('input[type="range"][data-setting]').forEach((range) => {
    const key = range.dataset.setting as keyof Settings;
    range.addEventListener("input", () => {
      SLIDER_PREVIEW[key]?.(parseInt(range.value, 10));
    });
    range.addEventListener("change", async () => {
      await saveSetting(key, parseInt(range.value, 10) as Settings[typeof key]);
      handleSettingChange(key);
    });
  });

  panel.querySelectorAll<HTMLElement>(".toggle-group[data-setting]").forEach((group) => {
    group.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement;
      const tgtBtn = target.closest<HTMLButtonElement>("button[data-value]");
      if (!tgtBtn || !group.contains(tgtBtn)) return;
      const key = group.dataset.setting as keyof Settings;
      const value = tgtBtn.dataset.value as Settings[typeof key];
      if (settings[key] === value) return;
      await saveSetting(key, value);
      syncSettingsUi();
      handleSettingChange(key);
    });
  });

  systemDarkMq.addEventListener("change", () => {
    if (settings.theme === "auto") applyTheme();
  });
}

export function setupBackoffStorageListener(): () => void {
  return getPlatform().storage.onChanged((changes, area) => {
    if (area === "local" && changes.unsplashBackoff) {
      updateBackgroundErrorVisibility({
        enabled: settings.backgroundEnabled,
        intervalHours: settings.backgroundIntervalHours,
      });
    }
  });
}

// Keeps every open new-tab in sync: when folder emojis change (here or in
// another tab), refresh the in-memory map and re-render the bar. This is the
// single render path — setFolderEmoji/clearFolderEmoji only persist.
export function setupFolderEmojiStorageListener(): () => void {
  return getPlatform().storage.onChanged((changes, area) => {
    if (area === "local" && changes.folderEmojis) {
      settings.folderEmojis =
        (changes.folderEmojis.newValue as Record<string, string>) ?? {};
      renderBookmarks();
    }
  });
}
