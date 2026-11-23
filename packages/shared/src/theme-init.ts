// Synchronously sets data-theme, data-style, data-bookmarks-position, and
// data-center-widget on <html> based on localStorage, before the stylesheet is
// parsed — prevents a flash of incorrect theme/style/layout. Also paints the
// wallpaper colour and starts the wallpaper load.
import { loadWallpaperImage } from "./wallpaper-store";

(function () {
  try {
    var t = localStorage.getItem("theme") || "auto";
    var resolved =
      t === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : t;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.style =
      localStorage.getItem("style") || "glass";
    document.documentElement.dataset.bookmarksPosition =
      localStorage.getItem("bookmarksPosition") || "top";
    document.documentElement.dataset.centerWidget =
      localStorage.getItem("centerWidget") || "clock";
    var cs = parseInt(localStorage.getItem("clockSize") || "110", 10);
    document.documentElement.style.setProperty(
      "--clock-scale",
      String((isNaN(cs) ? 110 : cs) / 100)
    );
    var gl = parseInt(localStorage.getItem("glassLevel") || "3", 10);
    if (isNaN(gl) || gl < 0 || gl > 6) gl = 3;
    document.documentElement.style.setProperty("--glass-level", String(gl / 6));
    var rotateAt = parseInt(localStorage.getItem("rotateAt") || "", 10);
    var rotating = rotateAt > 0 && Date.now() >= rotateAt;
    var bg =
      (rotating && localStorage.getItem("nextBackgroundColor")) ||
      localStorage.getItem("backgroundColor");
    if (bg) document.documentElement.style.setProperty("--bg-wallpaper", bg);
    var wallpaperUrl =
      (rotating && localStorage.getItem("nextWallpaperUrl")) ||
      localStorage.getItem("wallpaperUrl");
    if (wallpaperUrl) showEarlyWallpaper(wallpaperUrl);
  } catch (e) {}

  // Shows the wallpaper as soon as it is decoded, without waiting for the
  // page script's storage reads. It appears at once if it beats the first
  // frame, and fades in over the base colour otherwise.
  function showEarlyWallpaper(url: string) {
    var image = loadWallpaperImage(url);
    window.earlyWallpaper = { url: url, image: image };

    var colourPainted = false;
    requestAnimationFrame(function () {
      colourPainted = true;
    });

    function reveal(early: HTMLImageElement) {
      var layer = document.getElementById("wallpaper");
      if (!layer || layer.firstElementChild || early.isConnected) return;
      if (colourPainted) early.classList.add("fade-in");
      layer.append(early);
    }

    image.then(function (early) {
      if (document.getElementById("wallpaper")) reveal(early);
      else document.addEventListener("DOMContentLoaded", function () { reveal(early); });
    }, function () {});
  }
})();
