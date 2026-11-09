import { getWallpaper, coverRect, onBackdropChange, type Rgb } from "@/wallpaper";

// Picks light or dark text ("ink") per glass surface from what actually sits
// behind it: the wallpaper, downsampled to a few thousand pixels, averaged
// under the surface and composited with the glass tint. Writes data-ink on
// each surface (and on <html> for body-level glass); CSS swaps the tokens.
// The clock is deliberately not inked: its glass follows the theme instead.

const SAMPLE_W = 64;
const SAMPLE_H = 40;
const SURFACES = [
  "bookmarks-bar",
  "settings-panel",
  "bg-attribution",
  "settings-btn",
  "empty-bar-notice",
];

let sample: ImageData | null = null;
let sampledFrom: HTMLImageElement | null = null;
let sampledViewport = "";

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function sampleViewport(img: HTMLImageElement): ImageData | null {
  const key = `${innerWidth}x${innerHeight}`;
  if (sample && sampledFrom === img && sampledViewport === key) return sample;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { x, y, w, h } = coverRect(img);
  const sx = SAMPLE_W / innerWidth;
  const sy = SAMPLE_H / innerHeight;
  ctx.drawImage(img, x * sx, y * sy, w * sx, h * sy);
  try {
    sample = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
  } catch {
    sample = null;
  }
  sampledFrom = img;
  sampledViewport = key;
  return sample;
}

function meanColorUnder(data: ImageData, rect: DOMRect): Rgb {
  const x0 = Math.max(0, Math.floor((rect.left / innerWidth) * SAMPLE_W));
  const x1 = Math.min(SAMPLE_W, Math.ceil((rect.right / innerWidth) * SAMPLE_W));
  const y0 = Math.max(0, Math.floor((rect.top / innerHeight) * SAMPLE_H));
  const y1 = Math.min(SAMPLE_H, Math.ceil((rect.bottom / innerHeight) * SAMPLE_H));
  const sum: Rgb = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * SAMPLE_W + x) * 4;
      sum[0] += data.data[i]!;
      sum[1] += data.data[i + 1]!;
      sum[2] += data.data[i + 2]!;
      n++;
    }
  }
  return n ? [sum[0] / n, sum[1] / n, sum[2] / n] : [128, 128, 128];
}

function bodyColor(): Rgb {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
  return m ? [+m[1]!, +m[2]!, +m[3]!] : [128, 128, 128];
}

// What the eye sees through the glass: the tint composited over the backdrop
// per sRGB channel (as the browser blends it), same alphas as
// --glass-bg-strong in the stylesheet.
function surfaceLuminance(backdrop: Rgb, level: number, darkTheme: boolean): number {
  const alpha = darkTheme ? 0.8 * level : 0.32 + 0.48 * level;
  const tint: Rgb = darkTheme ? [28, 27, 34] : [255, 255, 255];
  const mix = (i: number) => alpha * tint[i]! + (1 - alpha) * backdrop[i]!;
  return luminance(mix(0), mix(1), mix(2));
}

// Black and white give equal contrast at ~0.18; a little hysteresis keeps a
// slider drag from flickering the text.
function pickInk(surface: number, previous: string | undefined): "light" | "dark" {
  if (previous === "light") return surface > 0.2 ? "dark" : "light";
  if (previous === "dark") return surface < 0.16 ? "light" : "dark";
  return surface > 0.18 ? "dark" : "light";
}

// Rewriting an unchanged value still fires the backdrop observer on <html>.
function setInk(el: HTMLElement, ink: string): void {
  if (el.dataset.ink !== ink) el.dataset.ink = ink;
}

export function updateInk(): void {
  const root = document.documentElement;
  const elements = SURFACES.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLElement => el !== null
  );
  if (root.dataset.style === "classic") {
    delete root.dataset.ink;
    for (const el of elements) delete el.dataset.ink;
    return;
  }
  const level = parseFloat(getComputedStyle(root).getPropertyValue("--glass-level")) || 0;
  const darkTheme = root.dataset.theme === "dark";
  const img = getWallpaper();
  const data = img ? sampleViewport(img) : null;
  const fallback = bodyColor();
  const inkFor = (rect: DOMRect, previous: string | undefined) => {
    const backdrop = data ? meanColorUnder(data, rect) : fallback;
    return pickInk(surfaceLuminance(backdrop, level, darkTheme), previous);
  };

  setInk(root, inkFor(new DOMRect(0, 0, innerWidth, innerHeight), root.dataset.ink));
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    setInk(el, inkFor(rect, el.dataset.ink));
  }
}

export function setupInk(): void {
  onBackdropChange(updateInk);
  const revealObserver = new MutationObserver(updateInk);
  for (const id of ["settings-panel", "bg-attribution", "empty-bar-notice"]) {
    const el = document.getElementById(id);
    if (el) revealObserver.observe(el, { attributeFilter: ["hidden"] });
  }
  updateInk();
}
