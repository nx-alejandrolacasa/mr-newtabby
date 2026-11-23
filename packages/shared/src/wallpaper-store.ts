// Wallpaper bytes kept in IndexedDB, keyed by image URL, so a photo that was
// shown or preloaded once is there on the next tab whatever the browser's
// HTTP cache has dropped.

const DB_NAME = "mr-newtabby-wallpapers";
const STORE = "images";

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function openStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const opening = indexedDB.open(DB_NAME, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
  const db = await settled(opening);
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function storedBlob(url: string): Promise<Blob | undefined> {
  return settled<Blob | undefined>((await openStore("readonly")).get(url));
}

async function wallpaperBlob(url: string): Promise<Blob> {
  const stored = await storedBlob(url).catch(() => undefined);
  if (stored) return stored;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wallpaper request ${response.status}`);
  const blob = await response.blob();
  await openStore("readwrite")
    .then((store) => settled(store.put(blob, url)))
    .catch(() => {});
  return blob;
}

// Resolves once the image is decoded, so showing or sampling it never decodes
// on the main thread. A blob image is same-origin, so its pixels can be read;
// if the bytes cannot be fetched the plain URL is tried, unreadable but visible.
export async function loadWallpaperImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.alt = "";
  img.draggable = false;
  img.dataset.url = url;
  const blobUrl = await wallpaperBlob(url).then(
    (blob) => URL.createObjectURL(blob),
    () => null
  );
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = blobUrl ?? url;
  });
  await img.decode().catch(() => {});
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  return img;
}

export async function pruneWallpapers(keep: string[]): Promise<void> {
  try {
    const store = await openStore("readwrite");
    for (const key of await settled(store.getAllKeys())) {
      if (!keep.includes(String(key))) store.delete(key);
    }
  } catch {
    /* nothing stored, nothing to prune */
  }
}
