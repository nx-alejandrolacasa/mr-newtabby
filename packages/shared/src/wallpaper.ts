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

function load(url: string, anonymous: boolean): void {
  const img = new Image();
  if (anonymous) img.crossOrigin = "anonymous";
  img.onload = () => {
    if (url !== imageUrl) return;
    image = img;
    notify();
  };
  img.onerror = () => {
    if (url === imageUrl && anonymous) load(url, false);
  };
  img.src = url;
}

export function getWallpaper(): HTMLImageElement | null {
  const match = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(document.body).backgroundImage);
  const url = match?.[1] ?? "";
  if (url !== imageUrl) {
    imageUrl = url;
    image = null;
    if (url) load(url, true);
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
