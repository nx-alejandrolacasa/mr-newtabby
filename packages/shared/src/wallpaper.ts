// One shared view of what sits behind the glass: the wallpaper image (loaded
// CORS-anonymous so its pixels can be read; plain retry if that is refused)
// and a single "backdrop changed" signal covering wallpaper swaps, theme,
// style, tint, clock size, bar position, resize and font load.

let image: HTMLImageElement | null = null;
let imageUrl = "";
const listeners = new Set<() => void>();
let frame: number | null = null;
let observing = false;

function notify(): void {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    listeners.forEach((cb) => cb());
  });
}

export function loadImage(url: string, anonymous = true): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      anonymous
        ? loadImage(url, false).then(resolve, reject)
        : reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function load(url: string): void {
  loadImage(url).then(
    (img) => {
      if (url !== imageUrl) return;
      image = img;
      notify();
    },
    () => {}
  );
}

export function getWallpaper(): HTMLImageElement | null {
  const match = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(document.body).backgroundImage);
  const url = match?.[1] ?? "";
  if (url !== imageUrl) {
    imageUrl = url;
    image = null;
    if (url) load(url);
  }
  return image?.complete && image.naturalWidth > 0 ? image : null;
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
