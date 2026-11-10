import { getPlatform } from "@/platform";
import { t } from "@/i18n";
import { getSettings, dismissTabGroupsTip } from "@/settings";
import { scheduleReflow } from "@/bookmarks";
import {
  getClosedGroups,
  reopenGroup,
  forgetGroup,
  resyncOpenGroups,
  TAB_GROUP_PERMISSIONS,
  type GroupSnapshot,
} from "@/tab-groups-store";

const SVG_NS = "http://www.w3.org/2000/svg";

// Tab-groups glyph: a 2×2 grid of rounded squares, mirroring the browsers' own
// tab-groups icon. Sized in CSS to match the link favicons / folder icons.
function createTabGroupsIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "tab-groups-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  for (const [x, y] of [
    [4, 4],
    [13, 4],
    [4, 13],
    [13, 13],
  ]) {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", "7");
    r.setAttribute("height", "7");
    r.setAttribute("rx", "2");
    svg.append(r);
  }
  return svg;
}

function createColorDot(color: string): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.className = "tab-group-dot";
  dot.dataset.color = color;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

function createGroupRow(snap: GroupSnapshot): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "tab-group-row";

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "bookmark-item tab-group-open";
  openBtn.title = snap.title || t("unnamedFolder");
  const label = document.createElement("span");
  label.className = "bookmark-title";
  label.textContent = snap.title || t("unnamedFolder");
  const count = document.createElement("span");
  count.className = "tab-group-count";
  count.textContent = String(snap.tabs.length);
  openBtn.append(createColorDot(snap.color), label, count);
  openBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await reopenGroup(snap.id);
    } catch (err) {
      console.error("Failed to reopen tab group", err);
    }
    await renderTabGroups();
  });

  // Direct forget button with a two-step confirm (replaces the old one-item
  // kebab menu): the first click arms it — the ✕ turns into a red "Forget?" —
  // and only a second click while armed deletes. Disarms on leaving the row or
  // losing focus, so stray clicks stay harmless.
  const forget = document.createElement("button");
  forget.type = "button";
  forget.className = "tab-group-forget";
  forget.setAttribute("aria-label", t("tabGroupsForget"));
  forget.title = t("tabGroupsForget");
  forget.textContent = "✕";

  const disarm = () => {
    if (!forget.classList.contains("confirming")) return;
    forget.classList.remove("confirming");
    // Play the settle animation while reverting; cleared on animationend so it
    // can replay on the next disarm.
    forget.classList.add("disarming");
    forget.textContent = "✕";
  };
  forget.addEventListener("animationend", () => forget.classList.remove("disarming"));
  forget.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!forget.classList.contains("confirming")) {
      forget.classList.add("confirming");
      forget.textContent = t("tabGroupsForgetConfirm");
      // macOS Firefox doesn't focus buttons on click; focus explicitly so the
      // blur disarm below works.
      forget.focus();
      return;
    }
    disarm();
    try {
      await forgetGroup(snap.id);
    } catch (err) {
      console.error("Failed to forget tab group", err);
    }
    await renderTabGroups();
  });
  li.addEventListener("mouseleave", disarm);
  forget.addEventListener("blur", disarm);

  li.append(openBtn, forget);
  return li;
}

// Shown when the feature is enabled but the optional permissions are gone —
// grants don't always outlive the setting (temporary installs drop them on
// restart; users can revoke them in the Add-ons Manager). Without this row the
// feature fails silently: the API namespace is undefined, so no group is ever
// captured. Clicking re-requests the grant (the click is the required user
// gesture; request() must run before any await).
function createPermissionRow(): HTMLLIElement {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bookmark-item tab-group-open tab-group-grant";
  btn.textContent = t("tabGroupsGrantPermission");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    void getPlatform()
      .permissions?.request([...TAB_GROUP_PERMISSIONS])
      .then(async (granted) => {
        if (!granted) return;
        await resyncOpenGroups();
        await renderTabGroups();
      });
  });
  li.append(btn);
  return li;
}

// Explanatory note about how groups get captured. Doubles as the empty state
// (when there are no saved groups) and as a dismissible tip (when there are).
// The dismiss button is only present when `dismissible` — when empty the note
// is the only content, so there's nothing to dismiss it to.
function createTip(dismissible: boolean): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "tab-group-tip";

  const text = document.createElement("span");
  text.className = "tab-group-tip-text";
  text.textContent = t("tabGroupsTip");
  li.append(text);

  if (dismissible) {
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "tab-group-tip-dismiss";
    dismiss.setAttribute("aria-label", t("tabGroupsTipDismiss"));
    dismiss.textContent = "✕";
    dismiss.addEventListener("click", async (e) => {
      e.stopPropagation();
      await dismissTabGroupsTip();
      await renderTabGroups();
    });
    li.append(dismiss);
  }

  return li;
}

// Render (or remove) the single tab-groups bar item. No-op-safe to call anytime.
function prependTabGroupsFolder(bar: HTMLElement): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "bookmark-folder tab-groups-folder";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "bookmark-item folder-button";
  button.title = t("tabGroupsIconLabel");
  button.setAttribute("aria-label", t("tabGroupsIconLabel"));
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  const barLabel = document.createElement("span");
  barLabel.className = "bookmark-title";
  barLabel.textContent = t("tabGroupsBarLabel");
  button.append(createTabGroupsIcon(), barLabel);

  const dropdown = document.createElement("ul");
  dropdown.className = "folder-dropdown tab-groups-dropdown";

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = wrapper.classList.contains("open");
    document.querySelectorAll(".bookmark-folder.open").forEach((el) => el.classList.remove("open"));
    if (!wasOpen) {
      wrapper.classList.add("open");
      button.setAttribute("aria-expanded", "true");
    }
  });

  wrapper.append(button, dropdown);
  // Insert as the first bar item (groups lead, before folders/links).
  bar.prepend(wrapper);
  scheduleReflow();
  return wrapper;
}

// The folder goes in before any await, so the bar has its final width on its
// first frame; only the menu contents wait for storage.
export async function renderTabGroups(): Promise<void> {
  const bar = document.getElementById("bookmarks-bar");
  if (!bar) return;

  if (!getSettings().tabGroupsEnabled || !getPlatform().tabGroups) {
    bar.querySelector(".tab-groups-folder")?.remove();
    return;
  }

  const folder = bar.querySelector<HTMLElement>(".tab-groups-folder") ?? prependTabGroupsFolder(bar);
  const dropdown = folder.querySelector(".tab-groups-dropdown")!;

  const perms = getPlatform().permissions;
  const granted = perms ? await perms.contains([...TAB_GROUP_PERMISSIONS]) : true;
  const closed = granted ? await getClosedGroups() : [];
  const tipDismissed = getSettings().tabGroupsTipDismissed;

  if (!granted) {
    dropdown.replaceChildren(createPermissionRow());
    return;
  }
  dropdown.replaceChildren(...closed.map(createGroupRow));
  // The note is the empty state when there are no groups (always shown, not
  // dismissible there), and a dismissible tip once groups exist.
  if (!closed.length || !tipDismissed) dropdown.append(createTip(closed.length > 0));
}

// Page-load backstop: snapshot whatever groups are open right now, then render.
export async function setupTabGroups(): Promise<void> {
  if (!getSettings().tabGroupsEnabled || !getPlatform().tabGroups) return;
  await resyncOpenGroups();
  await renderTabGroups();
}

// Keep the bar in sync when the background watcher updates the store.
export function setupTabGroupsStorageListener(): () => void {
  return getPlatform().storage.onChanged((changes, area) => {
    if (area === "local" && changes.tabGroups) void renderTabGroups();
  });
}
