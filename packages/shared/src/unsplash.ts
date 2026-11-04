import { getPlatform } from "@/platform";
import { loadImage, midtoneColor } from "@/wallpaper";

// Tabliss's curated wallpaper collection — ~545 hand-picked, consistent high quality.
const UNSPLASH_COLLECTION_ID = "1053828";

// Exponential-backoff bounds for Unsplash failures. Doubles each consecutive
// failure (30s → 1m → 2m → 4m → 8m → 16m → 30m).
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

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

function buildImageUrl(rawUrl: string): string {
  const w = targetImageWidth();
  return `${rawUrl}&w=${w}&q=85`;
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
function setBackgroundColor(color: string): void {
  document.body.style.backgroundColor = color;
  localStorage.setItem("backgroundColor", color);
}

function applyBackground(photo: (CachedBackground & { imageUrl: string }) | null): void {
  const body = document.body;
  if (!photo || !photo.imageUrl) return;
  setBackgroundColor(photo.averageColor ?? photo.color);
  body.style.backgroundImage = `url("${photo.imageUrl}")`;
  body.classList.add("has-background");

  const attr = document.getElementById("bg-attribution");
  const photoLink = document.getElementById("bg-photo-link") as HTMLAnchorElement | null;
  const author = document.getElementById("bg-author") as HTMLAnchorElement | null;
  const unsplashLink = document.getElementById("bg-unsplash-link") as HTMLAnchorElement | null;
  if (photo.authorName && photo.authorUrl && photoLink && author && unsplashLink && attr) {
    photoLink.href = photo.photoUrl || withUtm(UNSPLASH_HOME);
    author.textContent = photo.authorName;
    author.href = photo.authorUrl;
    unsplashLink.href = withUtm(UNSPLASH_HOME);
    attr.hidden = false;
  } else if (attr) {
    attr.hidden = true;
  }
}

// Backgrounds cached before the midtone colour existed get it computed and
// persisted the first time it is needed.
async function averageColorOf(cached: CachedBackground): Promise<string> {
  if (cached.averageColor) return cached.averageColor;
  const storage = getPlatform().storage;
  const img = await loadImage(buildImageUrl(cached.rawUrl));
  const averageColor = midtoneColor(img) ?? cached.color;
  const { cachedBackground } = await storage.get(["cachedBackground"]);
  const current = cachedBackground as CachedBackground | undefined;
  if (current?.rawUrl === cached.rawUrl) {
    await storage.set({ cachedBackground: { ...current, averageColor } });
  }
  return averageColor;
}

function clearBackground(): void {
  const body = document.body;
  body.classList.remove("has-background");
  body.style.backgroundImage = "";
  const attr = document.getElementById("bg-attribution");
  if (attr) attr.hidden = true;
}

export async function loadBackground(
  opts: { force?: boolean; enabled: boolean; intervalHours: number }
): Promise<void> {
  if (!opts.enabled) {
    clearBackground();
    const { cachedBackground } = await getPlatform().storage.get(["cachedBackground"]);
    const cached = cachedBackground as CachedBackground | undefined;
    if (cached?.rawUrl) setBackgroundColor(await averageColorOf(cached));
    return;
  }

  const stored = await getPlatform().storage.get(["cachedBackground", "unsplashBackoff"]);
  const cachedBackground = stored.cachedBackground as CachedBackground | undefined;
  const backoff = (stored.unsplashBackoff as UnsplashBackoff | undefined) ?? {
    failures: 0,
    nextAttemptAt: 0,
  };

  const intervalMs = (opts.intervalHours || 6) * 60 * 60 * 1000;
  const isExpired =
    !cachedBackground ||
    !cachedBackground.rawUrl ||
    !cachedBackground.fetchedAt ||
    Date.now() - cachedBackground.fetchedAt > intervalMs;

  if (cachedBackground && cachedBackground.rawUrl) {
    applyBackground({
      ...cachedBackground,
      imageUrl: buildImageUrl(cachedBackground.rawUrl),
    });
  }

  if (!opts.force && !isExpired) return;

  const now = Date.now();
  if (now < backoff.nextAttemptAt) {
    const waitS = Math.ceil((backoff.nextAttemptAt - now) / 1000);
    console.warn(
      `Unsplash backoff active (${backoff.failures} consecutive failures); next attempt in ${waitS}s`
    );
    if (!cachedBackground?.rawUrl) clearBackground();
    return;
  }

  if (hasUnsplashKey()) {
    try {
      const fresh = await fetchUnsplashRandomPhoto();
      const imageUrl = buildImageUrl(fresh.rawUrl);
      const img = await loadImage(imageUrl);
      const cached: CachedBackground = {
        rawUrl: fresh.rawUrl,
        color: fresh.color,
        averageColor: midtoneColor(img) ?? fresh.color,
        authorName: fresh.authorName,
        authorUrl: fresh.authorUrl,
        photoUrl: fresh.photoUrl,
        fetchedAt: Date.now(),
      };
      await getPlatform().storage.set({
        cachedBackground: cached,
        unsplashBackoff: { failures: 0, nextAttemptAt: 0 },
      });
      applyBackground({ ...cached, imageUrl });
      triggerUnsplashDownload(fresh.downloadLocation);
      return;
    } catch (err) {
      const failures = backoff.failures + 1;
      const delay = backoffDelayMs(failures);
      await getPlatform().storage.set({
        unsplashBackoff: {
          failures,
          nextAttemptAt: Date.now() + delay,
          lastErrorMessage: String((err as Error)?.message || err),
          lastErrorAt: Date.now(),
        } satisfies UnsplashBackoff,
      });
      console.warn(
        `Unsplash fetch failed (attempt ${failures}); next attempt in ${Math.round(delay / 1000)}s`,
        err
      );
    }
  }

  if (!cachedBackground?.rawUrl) {
    clearBackground();
  }
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
