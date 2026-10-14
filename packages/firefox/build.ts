// packages/firefox/build.ts — esbuild + static copy + manifest version stamp.
//
// Run via:  npx tsx build.ts            (one-shot build)
//           npx tsx build.ts --watch    (rebuild on file change)
//
// Output: ./dist/, a fully-self-contained Firefox-loadable extension dir.
import { build, context, type BuildOptions } from "esbuild";
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadUnsplashKey } from "../shared/src/build-helpers/load-env.ts";
import { validateDist } from "../shared/src/build-helpers/validate-dist.ts";

const REQUIRED_DIST_FILES = [
  "manifest.json",
  "newtab.html",
  "newtab.css",
  "newtab.js",
  "background.js",
  "theme-init.js",
  "_locales/en/messages.json",
  "icons/icon.svg",
  "icons/favicon.svg",
  "icons/bmc-logo.svg",
  "fonts/Cookie-Regular.ttf",
  "fonts/Satoshi-Variable.ttf",
] as const;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SHARED_DIR = path.resolve(REPO_ROOT, "packages", "shared");
const DIST = path.join(HERE, "dist");
const WATCH = process.argv.includes("--watch");
const DEV = WATCH || process.env.NODE_ENV !== "production";

async function readSharedVersion(): Promise<string> {
  const { version } = JSON.parse(
    await readFile(path.join(SHARED_DIR, "package.json"), "utf8")
  );
  return version;
}

async function copyAssets(version: string) {
  const sharedAssets = path.join(SHARED_DIR, "assets");
  const sharedLocales = path.join(SHARED_DIR, "_locales");

  // newtab.html, newtab.css live in shared/assets.
  for (const f of ["newtab.html", "newtab.css"]) {
    await cp(path.join(sharedAssets, f), path.join(DIST, f));
  }
  // icons, fonts come from shared/assets/<name>.
  for (const dir of ["icons", "fonts"]) {
    await cp(path.join(sharedAssets, dir), path.join(DIST, dir), { recursive: true });
  }
  // Locales come from shared/_locales (next to assets, not inside it — matches
  // the on-disk structure WebExtensions expects under the extension root).
  await cp(sharedLocales, path.join(DIST, "_locales"), { recursive: true });

  // Stamp version into manifest.
  const manifest = JSON.parse(await readFile(path.join(HERE, "manifest.json"), "utf8"));
  manifest.version = version;
  await writeFile(
    path.join(DIST, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
}

function pageBundleOptions(unsplashKey: string): BuildOptions {
  return {
    entryPoints: [path.join(HERE, "src", "entry.ts")],
    outfile: path.join(DIST, "newtab.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["firefox142"],
    sourcemap: DEV ? "inline" : false,
    minify: !DEV,
    define: {
      __UNSPLASH_KEY__: JSON.stringify(unsplashKey),
    },
    logLevel: "info",
  };
}

function themeInitBundleOptions(): BuildOptions {
  // theme-init.ts must execute synchronously in <head>, before stylesheet parse.
  return {
    entryPoints: [path.join(SHARED_DIR, "src", "theme-init.ts")],
    outfile: path.join(DIST, "theme-init.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["firefox142"],
    sourcemap: DEV ? "inline" : false,
    minify: !DEV,
    logLevel: "info",
  };
}

function backgroundBundleOptions(): BuildOptions {
  return {
    entryPoints: [path.join(HERE, "src", "background.ts")],
    outfile: path.join(DIST, "background.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["firefox142"],
    sourcemap: DEV ? "inline" : false,
    minify: !DEV,
    logLevel: "info",
  };
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const [unsplashKey, version] = await Promise.all([
    loadUnsplashKey(path.join(REPO_ROOT, ".env")),
    readSharedVersion(),
  ]);

  await copyAssets(version);

  if (WATCH) {
    const pageCtx = await context(pageBundleOptions(unsplashKey));
    const themeCtx = await context(themeInitBundleOptions());
    const backgroundCtx = await context(backgroundBundleOptions());
    await Promise.all([pageCtx.watch(), themeCtx.watch(), backgroundCtx.watch()]);
    console.log("esbuild watching… (Ctrl+C to exit)");
  } else {
    await Promise.all([
      build(pageBundleOptions(unsplashKey)),
      build(themeInitBundleOptions()),
      build(backgroundBundleOptions()),
    ]);
    await validateDist(DIST, REQUIRED_DIST_FILES);
    console.log(`Built @mr-newtabby/firefox v${version} → ${path.relative(REPO_ROOT, DIST)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
