// One shared view of what sits behind the glass: the wallpaper layer (its
// image loaded CORS-anonymous so pixels can be read; plain retry if that is
// refused) and a single "backdrop changed" signal covering wallpaper swaps,
// theme, style, tint, clock size, bar position, resize and font load.

let shown: HTMLImageElement | null = null;
const listeners = new Set<() => void>();
let frame: number | null = null;
let observing = false;

declare global {
  interface Window {
    // Started by theme-init from the URL mirrored in localStorage, so the
    // download overlaps script parsing and the extension storage reads.
    earlyWallpaper?: HTMLImageElement;
  }
}

function notify(): void {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    listeners.forEach((cb) => cb());
  });
}

function absolute(url: string): string {
  return new URL(url, location.href).href;
}

function adoptEarlyWallpaper(url: string): HTMLImageElement | null {
  const early = window.earlyWallpaper;
  if (!early || early.src !== absolute(url)) return null;
  window.earlyWallpaper = undefined;
  return early;
}

// Resolves once the image is decoded, so showing or sampling it never decodes
// on the main thread.
export function loadImage(url: string, anonymous = true): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const early = anonymous ? adoptEarlyWallpaper(url) : null;
    const img = early ?? new Image();
    const succeed = () => void img.decode().catch(() => {}).then(() => resolve(img));
    const fail = () =>
      anonymous
        ? loadImage(url, false).then(resolve, reject)
        : reject(new Error(`Failed to load ${url}`));
    if (early?.complete) {
      if (early.naturalWidth) succeed();
      else fail();
      return;
    }
    img.onload = succeed;
    img.onerror = fail;
    if (!early) {
      if (anonymous) img.crossOrigin = "anonymous";
      img.src = url;
    }
  });
}

// Waits for the fade itself rather than a timer: frames stall in hidden tabs,
// and the old image must stay until the new one is opaque.
function removeAfterFade(img: HTMLImageElement, fading: HTMLImageElement): void {
  const remove = () => img.remove();
  fading.addEventListener("transitionend", remove, { once: true });
  fading.addEventListener("transitioncancel", remove, { once: true });
}

// theme-init may already have put the early image on the layer.
function shownImage(): HTMLImageElement | null {
  shown ??= document.querySelector<HTMLImageElement>("#wallpaper img:not(.leaving)");
  return shown;
}

export function isShowingWallpaper(url: string): boolean {
  return shownImage()?.src === absolute(url);
}

// Puts `img` (or nothing) on the wallpaper layer. A new image fades in above
// the previous one, which stays opaque underneath until the fade is done. By
// the time the page gets here the base colour has been painted, so even a
// tab's first wallpaper fades in rather than popping.
export function showWallpaper(img: HTMLImageElement | null): void {
  const previous = shownImage();
  if (img === previous) return;
  const layer = document.getElementById("wallpaper");
  if (!layer) return;
  shown = img;
  if (img) {
    img.alt = "";
    img.draggable = false;
    img.classList.add("fade-in");
    layer.append(img);
  } else {
    previous?.classList.add("leaving");
  }
  if (previous) removeAfterFade(previous, img ?? previous);
  notify();
}

export function getWallpaper(): HTMLImageElement | null {
  const img = shownImage();
  return img?.complete && img.naturalWidth > 0 ? img : null;
}

// Where `background-size: cover; background-position: center` places the
// wallpaper in the viewport.
export function coverRect(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(innerWidth / img.naturalWidth, innerHeight / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h };
}

export function onBackdropChange(cb: () => void): void {
  listeners.add(cb);
  if (observing) return;
  observing = true;
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true });
  observer.observe(document.body, { attributes: true });
  const layer = document.getElementById("wallpaper");
  if (layer) observer.observe(layer, { childList: true });
  document.body.addEventListener("transitionend", (e) => {
    if (e.target === document.body) notify();
  });
  window.addEventListener("resize", notify);
  document.fonts?.ready.then(notify);
}

export type Rgb = [number, number, number];

const SAMPLE_W = 64;
const SAMPLE_H = 40;
const MIDTONE_MIN = 0.15;
const MIDTONE_MAX = 0.85;
const MIDTONE_MIN_SHARE = 0.05;

// Mean of the pixels that are neither near-white nor near-black, so a snowy or
// night wallpaper still yields a usable mid colour. Falls back to the plain
// mean when almost nothing is left.
export function midtoneMean(pixels: Uint8ClampedArray): Rgb {
  const all: Rgb = [0, 0, 0];
  const mid: Rgb = [0, 0, 0];
  let n = 0;
  let m = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    all[0] += r;
    all[1] += g;
    all[2] += b;
    n++;
    const lightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lightness < MIDTONE_MIN || lightness > MIDTONE_MAX) continue;
    mid[0] += r;
    mid[1] += g;
    mid[2] += b;
    m++;
  }
  const [sum, count] = m >= n * MIDTONE_MIN_SHARE ? [mid, m] : [all, n];
  if (!count) return [128, 128, 128];
  return [Math.round(sum[0] / count), Math.round(sum[1] / count), Math.round(sum[2] / count)];
}

export function midtoneColor(img: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
  try {
    const [r, g, b] = midtoneMean(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data);
    return `rgb(${r} ${g} ${b})`;
  } catch {
    return null;
  }
}
