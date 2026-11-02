// Big center clock, drawn on a canvas so the glyphs can be real glass: the
// wallpaper region behind the clock is blurred and kept only inside the
// digits, then the tint sheen is painted over it. Edge light and the soft
// shadow come from CSS filters on the canvas element. Locale-aware HH:MM via
// Intl (no locale arg → the browser decides 12h/24h), ticking on the minute.

import { getWallpaper, coverRect, onBackdropChange } from "@/wallpaper";

let timer: ReturnType<typeof setTimeout> | null = null;
let formatter: Intl.DateTimeFormat | null = null;
let frame: number | null = null;

function currentTime(): string {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return formatter.format(new Date());
}

function drawCoveredWallpaper(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasRect: DOMRect
): void {
  const { x, y, w, h } = coverRect(img);
  ctx.drawImage(img, x - canvasRect.left, y - canvasRect.top, w, h);
}

// White glass in the light theme, smoked glass in the dark theme.
function tintGradient(
  ctx: CanvasRenderingContext2D,
  top: number,
  bottom: number,
  level: number,
  darkTheme: boolean
) {
  const rgb = darkTheme ? "22 22 30" : "255 255 255";
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, `rgb(${rgb} / ${0.4 + 0.55 * level})`);
  g.addColorStop(0.55, `rgb(${rgb} / ${0.14 + 0.6 * level})`);
  g.addColorStop(1, `rgb(${rgb} / ${0.24 + 0.6 * level})`);
  return g;
}

function render(): void {
  frame = null;
  const canvas = document.getElementById("clock-canvas") as HTMLCanvasElement | null;
  const clock = document.getElementById("clock");
  if (!canvas || !clock) return;
  const time = currentTime();
  canvas.setAttribute("aria-label", time);

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const clockStyle = getComputedStyle(clock);
  const glass = root.dataset.style !== "classic";
  const level = parseFloat(rootStyle.getPropertyValue("--glass-level")) || 0;
  const fontSize = parseFloat(clockStyle.fontSize);
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  ctx.font = `${clockStyle.fontWeight} ${fontSize}px ${clockStyle.fontFamily}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = clockStyle.letterSpacing;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const img = glass ? getWallpaper() : null;
  if (img) {
    ctx.filter = clockStyle.getPropertyValue("--clock-glass-filter").trim() || "none";
    drawCoveredWallpaper(ctx, img, rect);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#000";
    ctx.fillText(time, cx, cy);
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.fillStyle = glass
    ? tintGradient(ctx, cy - fontSize / 2, cy + fontSize / 2, level, root.dataset.theme === "dark")
    : "#fff";
  ctx.fillText(time, cx, cy);
}

export function scheduleRender(): void {
  if (frame !== null) return;
  frame = requestAnimationFrame(render);
}

function scheduleNextTick(): void {
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  timer = setTimeout(() => {
    scheduleRender();
    scheduleNextTick();
  }, msToNextMinute);
}

let observing = false;

function observeEnvironment(): void {
  if (observing) return;
  observing = true;
  onBackdropChange(scheduleRender);
}

export function startClock(): void {
  observeEnvironment();
  scheduleRender();
  if (timer === null) scheduleNextTick();
}

export function stopClock(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}
