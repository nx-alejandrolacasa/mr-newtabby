import { getPlatform } from "@/platform";
import {
  loadImage,
  midtoneColor,
  showWallpaper,
  isShowingWallpaper,
} from "@/wallpaper";

// Tabliss's curated wallpaper collection — ~545 hand-picked, consistent high quality.
const UNSPLASH_COLLECTION_ID = "1053828";

// Exponential-backoff bounds for Unsplash failures. Doubles each consecutive
// failure (30s → 1m → 2m → 4m → 8m → 16m → 30m).
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;
const NO_BACKOFF: UnsplashBackoff = { failures: 0, nextAttemptAt: 0 };
// A hung request would hold the wallpaper lock for every tab.
const FETCH_TIMEOUT_MS = 15 * 1000;

// Held while a tab talks to Unsplash or promotes the preloaded photo, so
// several tabs opening at once make one API call, not one each.
const WALLPAPER_LOCK = "mr-newtabby-wallpaper";

const ROTATION_KEYS = ["nextBackgroundColor", "nextWallpaperUrl", "rotateAt"] as const;

// Per Unsplash API guidelines, every link back to unsplash.com must include UTM
// params. The `utm_source` should match the application name registered at
// https://unsplash.com/oauth/applications.
const UNSPLASH_UTM_SOURCE = "topmarks";
const UNSPLASH_HOME = "https://unsplash.com/";

// esbuild's `define` substitutes this with the literal string at build time.
declare const __UNSPLASH_KEY__: string;

function backoffDelayMs(failures: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, failures - 1), BACKOFF_MAX_MS);
}

export function withUtm(urlString: string): string {
  try {
    const u = new URL(urlString);
    u.searchParams.set("utm_source", UNSPLASH_UTM_SOURCE);
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", "api-credit");
    return u.toString();
  } catch {
    return urlString;
  }
}

function hasUnsplashKey(): boolean {
  return typeof __UNSPLASH_KEY__ === "string" && __UNSPLASH_KEY__.length > 0;
}

function targetImageWidth(): number {
  const dpr = window.devicePixelRatio || 1;
  const raw = window.screen.width * dpr;
  const snapped = Math.round(raw / 240) * 240;
  return Math.max(1920, Math.min(snapped, 3840));
}

function buildImageUrl(rawUrl: string, width: number): string {
  return `${rawUrl}&w=${width}&q=85`;
}

// Reuses the width the photo was downloaded at when it is enough for this
// screen, so the HTTP cache hits; a bigger screen fetches its own size.
function imageUrlFor(photo: CachedBackground): string {
  return buildImageUrl(photo.rawUrl, Math.max(targetImageWidth(), photo.imageWidth ?? 0));
}

interface UnsplashPhoto {
  rawUrl: string;
  color: string;
  authorName: string;
  authorUrl: string;
  photoUrl: string;
  downloadLocation?: string;
}

interface CachedBackground {
  rawUrl: string;
  color: string;
  authorName: string;
  authorUrl: string;
  photoUrl: string;
  fetchedAt: number;
  averageColor?: string;
  downloadLocation?: string;
  imageWidth?: number;
}

interface UnsplashBackoff {
  failures: number;
  nextAttemptAt: number;
  lastErrorMessage?: string;
  lastErrorAt?: number;
}

async function fetchUnsplashRandomPhoto(): Promise<UnsplashPhoto> {
  if (!hasUnsplashKey()) throw new Error("Unsplash access key not configured");
  const url = new URL("https://api.unsplash.com/photos/random");
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("collections", UNSPLASH_COLLECTION_ID);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${__UNSPLASH_KEY__}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Unsplash API ${res.status}`);
  const photo = await res.json();

  return {
    rawUrl: photo.urls.raw,
    color: photo.color,
    authorName: photo.user?.name || "Unknown",
    authorUrl: withUtm(photo.user?.links?.html || UNSPLASH_HOME),
    photoUrl: withUtm(photo.links?.html || UNSPLASH_HOME),
    downloadLocation: photo.links?.download_location,
  };
}

async function triggerUnsplashDownload(downloadLocation: string | undefined): Promise<void> {
  if (!downloadLocation || !hasUnsplashKey()) return;
  try {
    await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${__UNSPLASH_KEY__}` },
    });
  } catch {
    /* tracking ping; ignore failures */
  }
}

// Mirrored to localStorage so theme-init can paint it before the first frame.
let appliedColor = "";
function setBackgroundColor(color: string): void {
  if (color === appliedColor) return;
  appliedColor = color;
  document.body.style.backgroundColor = color;
  localStorage.setItem("backgroundColor", color);
}

function showAttribution(photo: CachedBackground | null): void {
  const attr = document.getElementById("bg-attribution");
  const photoLink = document.getElementById("bg-photo-link") as HTMLAnchorElement | null;
  const author = document.getElementById("bg-author") as HTMLAnchorElement | null;
  const unsplashLink = document.getElementById("bg-unsplash-link") as HTMLAnchorElement | null;
  if (!attr) return;
  if (photo?.authorName && photo.authorUrl && photoLink && author && unsplashLink) {
    photoLink.href = photo.photoUrl || withUtm(UNSPLASH_HOME);
    author.textContent = photo.authorName;
    author.href = photo.authorUrl;
    unsplashLink.href = withUtm(UNSPLASH_HOME);
    attr.hidden = false;
  } else {
    attr.hidden = true;
  }
}

// Shows the photo once its image is decoded; a newer apply in the meantime
// wins. Resolves to false only when the image could not be loaded.
let applyToken = 0;
async function applyBackground(
  photo: CachedBackground,
  loaded?: HTMLImageElement
): Promise<boolean> {
  const token = ++applyToken;
  const url = loaded?.src ?? imageUrlFor(photo);
  if (!isShowingWallpaper(url)) {
    let img = loaded;
    try {
      img ??= await loadImage(url);
    } catch (err) {
      console.warn("Wallpaper failed to load", err);
      return false;
    }
    if (token !== applyToken) return true;
    showWallpaper(img);
  }
  setBackgroundColor(photo.averageColor ?? photo.color);
  localStorage.setItem("wallpaperUrl", url);
  showAttribution(photo);
  return true;
}

// Backgrounds cached before the midtone colour existed get it computed and
// persisted the first time it is needed.
async function averageColorOf(cached: CachedBackground): Promise<string> {
  if (cached.averageColor) return cached.averageColor;
  const storage = getPlatform().storage;
  const img = await loadImage(imageUrlFor(cached));
  const averageColor = midtoneColor(img) ?? cached.color;
  const { cachedBackground } = await storage.get(["cachedBackground"]);
  const current = cachedBackground as CachedBackground | undefined;
  if (current?.rawUrl === cached.rawUrl) {
    await storage.set({ cachedBackground: { ...current, averageColor } });
  }
  return averageColor;
}

// theme-init paints the next photo's colour and starts its download once the
// rotation is due, so the tab that rotates opens on the right colour.
function rememberRotation(next: CachedBackground, rotateAt: number): void {
  localStorage.setItem("nextBackgroundColor", next.averageColor ?? next.color);
  localStorage.setItem("nextWallpaperUrl", imageUrlFor(next));
  localStorage.setItem("rotateAt", String(rotateAt));
}

function forgetRotation(): void {
  for (const key of ROTATION_KEYS) localStorage.removeItem(key);
}

function clearBackground(): void {
  applyToken++;
  showWallpaper(null);
  showAttribution(null);
  localStorage.removeItem("wallpaperUrl");
  forgetRotation();
}

async function fetchPhoto(): Promise<{ photo: CachedBackground; img: HTMLImageElement }> {
  const fresh = await fetchUnsplashRandomPhoto();
  const imageWidth = targetImageWidth();
  const img = await loadImage(buildImageUrl(fresh.rawUrl, imageWidth));
  const photo: CachedBackground = {
    rawUrl: fresh.rawUrl,
    color: fresh.color,
    averageColor: midtoneColor(img) ?? fresh.color,
    authorName: fresh.authorName,
    authorUrl: fresh.authorUrl,
    photoUrl: fresh.photoUrl,
    downloadLocation: fresh.downloadLocation,
    imageWidth,
    fetchedAt: Date.now(),
  };
  return { photo, img };
}

type BackoffKey = "unsplashBackoff" | "preloadBackoff";

async function recordFailure(key: BackoffKey, backoff: UnsplashBackoff, err: unknown): Promise<void> {
  const failures = backoff.failures + 1;
  const delay = backoffDelayMs(failures);
  await getPlatform().storage.set({
    [key]: {
      failures,
      nextAttemptAt: Date.now() + delay,
      lastErrorMessage: String((err as Error)?.message || err),
      lastErrorAt: Date.now(),
    } satisfies UnsplashBackoff,
  });
  console.warn(
    `Unsplash fetch failed (${key}, attempt ${failures}); next attempt in ${Math.round(delay / 1000)}s`,
    err
  );
}

function inBackoff(backoff: UnsplashBackoff): boolean {
  const now = Date.now();
  if (now < backoff.nextAttemptAt) {
    const waitS = Math.ceil((backoff.nextAttemptAt - now) / 1000);
    console.warn(
      `Unsplash backoff active (${backoff.failures} consecutive failures); next attempt in ${waitS}s`
    );
    return true;
  }
  return false;
}

// Runs `task` unless another tab already holds the lock.
async function withUnsplashLock(task: () => Promise<void>): Promise<void> {
  await navigator.locks.request(WALLPAPER_LOCK, { ifAvailable: true }, async (lock) => {
    if (lock) await task();
  });
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => requestIdleCallback(() => resolve(), { timeout: 5000 }));
}

// Picks and downloads the photo after `current` in idle time, so the rotation
// can happen with no request on the critical path. Failures back off on their
// own key: the wallpaper on screen is fine, so no error is shown.
async function preloadNext(current: CachedBackground, rotateAt: number): Promise<void> {
  if (!hasUnsplashKey()) return;
  await whenIdle();
  const storage = getPlatform().storage;
  await withUnsplashLock(async () => {
    const stored = await storage.get(["cachedBackground", "nextBackground", "preloadBackoff"]);
    const latest = stored.cachedBackground as CachedBackground | undefined;
    if (latest?.rawUrl !== current.rawUrl) return;
    const existing = stored.nextBackground as CachedBackground | undefined;
    if (existing?.rawUrl && existing.rawUrl !== current.rawUrl) {
      rememberRotation(existing, rotateAt);
      return;
    }
    const backoff = (stored.preloadBackoff as UnsplashBackoff | undefined) ?? NO_BACKOFF;
    if (inBackoff(backoff)) return;
    try {
      const { photo } = await fetchPhoto();
      await storage.set({ nextBackground: photo, preloadBackoff: NO_BACKOFF });
      rememberRotation(photo, rotateAt);
    } catch (err) {
      await recordFailure("preloadBackoff", backoff, err);
    }
  });
}

// Every tab that rotates shows the photo; only the first one saves it and
// sends Unsplash's download ping.
async function persistPromotion(photo: CachedBackground): Promise<void> {
  const storage = getPlatform().storage;
  await navigator.locks.request(WALLPAPER_LOCK, async () => {
    const { cachedBackground } = await storage.get(["cachedBackground"]);
    if ((cachedBackground as CachedBackground | undefined)?.rawUrl === photo.rawUrl) return;
    await storage.set({ cachedBackground: photo, nextBackground: null });
    triggerUnsplashDownload(photo.downloadLocation);
  });
}

export async function loadBackground(
  opts: { force?: boolean; enabled: boolean; intervalHours: number }
): Promise<void> {
  const storage = getPlatform().storage;
  if (!opts.enabled) {
    clearBackground();
    const { cachedBackground } = await storage.get(["cachedBackground"]);
    const cached = cachedBackground as CachedBackground | undefined;
    if (cached?.rawUrl) setBackgroundColor(await averageColorOf(cached));
    return;
  }

  const stored = await storage.get(["cachedBackground", "nextBackground", "unsplashBackoff"]);
  const current = stored.cachedBackground as CachedBackground | undefined;
  const next = stored.nextBackground as CachedBackground | undefined;
  const backoff = (stored.unsplashBackoff as UnsplashBackoff | undefined) ?? NO_BACKOFF;

  const intervalMs = (opts.intervalHours || 6) * 60 * 60 * 1000;
  const rotateAt = (photo: CachedBackground) => photo.fetchedAt + intervalMs;
  const hasNext = !!next?.rawUrl && next.rawUrl !== current?.rawUrl;

  if (!opts.force && current?.rawUrl && current.fetchedAt && Date.now() < rotateAt(current)) {
    const shown = applyBackground(current);
    if (hasNext) rememberRotation(next!, rotateAt(current));
    else void shown.then((ok) => (ok ? preloadNext(current, rotateAt(current)) : undefined));
    return;
  }

  if (hasNext) {
    const promoted = { ...next!, fetchedAt: Date.now() };
    if (await applyBackground(promoted)) {
      forgetRotation();
      void persistPromotion(promoted).then(() => preloadNext(promoted, rotateAt(promoted)));
      return;
    }
  }

  if (current?.rawUrl) void applyBackground(current);

  if (!hasUnsplashKey() || inBackoff(backoff)) {
    if (!current?.rawUrl) clearBackground();
    return;
  }

  await withUnsplashLock(async () => {
    try {
      const { photo, img } = await fetchPhoto();
      await storage.set({
        cachedBackground: photo,
        nextBackground: null,
        unsplashBackoff: NO_BACKOFF,
      });
      forgetRotation();
      await applyBackground(photo, img);
      triggerUnsplashDownload(photo.downloadLocation);
      void preloadNext(photo, rotateAt(photo));
    } catch (err) {
      await recordFailure("unsplashBackoff", backoff, err);
      if (!current?.rawUrl) clearBackground();
    }
  });
}

export async function updateBackgroundErrorVisibility(opts: {
  enabled: boolean;
  intervalHours: number;
}): Promise<void> {
  const errorEl = document.getElementById("setting-bg-error");
  const intervalEl = document.getElementById("setting-bg-interval");
  if (!errorEl || !intervalEl) return;

  if (!opts.enabled) {
    errorEl.hidden = true;
    intervalEl.hidden = false;
    return;
  }

  const stored = await getPlatform().storage.get(["unsplashBackoff", "cachedBackground"]);
  const unsplashBackoff = stored.unsplashBackoff as UnsplashBackoff | undefined;
  const cachedBackground = stored.cachedBackground as CachedBackground | undefined;

  const now = Date.now();
  const active =
    !!unsplashBackoff &&
    unsplashBackoff.failures > 0 &&
    unsplashBackoff.nextAttemptAt > now;

  errorEl.hidden = !active;
  intervalEl.hidden = active;

  if (active) {
    console.error("[Mr. Newtabby] Wallpaper error shown in settings.", {
      consecutiveFailures: unsplashBackoff!.failures,
      nextAttemptInSeconds: Math.ceil((unsplashBackoff!.nextAttemptAt - now) / 1000),
      nextAttemptAt: new Date(unsplashBackoff!.nextAttemptAt).toISOString(),
      lastErrorMessage: unsplashBackoff!.lastErrorMessage ?? null,
      lastErrorAt: unsplashBackoff!.lastErrorAt
        ? new Date(unsplashBackoff!.lastErrorAt).toISOString()
        : null,
      cachedBackgroundShown: !!cachedBackground?.rawUrl,
      cachedBackgroundFetchedAt: cachedBackground?.fetchedAt
        ? new Date(cachedBackground.fetchedAt).toISOString()
        : null,
      cachedBackgroundAgeHours: cachedBackground?.fetchedAt
        ? Math.round(((now - cachedBackground.fetchedAt) / 36e5) * 10) / 10
        : null,
      backgroundIntervalHours: opts.intervalHours,
      hasUnsplashKey: hasUnsplashKey(),
    });
  } else {
    console.info("[Mr. Newtabby] No active wallpaper error.", {
      backoff: unsplashBackoff ?? null,
      cachedBackgroundShown: !!cachedBackground?.rawUrl,
    });
  }
}
