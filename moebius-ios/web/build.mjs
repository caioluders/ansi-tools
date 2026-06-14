// build.mjs — bundles the Moebius renderer + iOS shims into a single browser
// script and assembles the static web payload (`dist/www`) that the iOS app
// embeds and a WKWebView loads.
//
//   node build.mjs            one-off build
//   node build.mjs --watch    rebuild on change

import esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const www = path.join(dist, "www");
const vendor = path.join(root, "vendor/moebius");

const watch = process.argv.includes("--watch");

function copy_assets() {
    rmSync(dist, { recursive: true, force: true });
    mkdirSync(www, { recursive: true });
    // Static assets loaded at runtime via <link>/fetch (CSS, bitmap fonts,
    // toolbar images, help pages).
    for (const dir of ["css", "fonts", "img", "html"]) {
        cpSync(path.join(vendor, dir), path.join(www, dir), { recursive: true });
    }
    // Host page + touch styling.
    cpSync(path.join(root, "src/index.html"), path.join(www, "index.html"));
    cpSync(path.join(root, "src/mobile.css"), path.join(www, "mobile.css"));
    // Menu model, so the native shell can build an iPad menu bar / key commands
    // from the same data the web menu uses.
    cpSync(path.join(root, "src/menu_data.json"), path.join(www, "menu_data.json"));
}

const options = {
    entryPoints: [path.join(root, "src/bootstrap.js")],
    bundle: true,
    outfile: path.join(www, "moebius.bundle.js"),
    format: "iife",
    platform: "browser",
    target: ["safari15"],
    sourcemap: true,
    logLevel: "info",
    // Map Node/Electron modules onto browser-safe shims.
    alias: {
        electron: path.join(root, "shims/electron.js"),
        "@electron/remote": path.join(root, "shims/electron-remote.js"),
        fs: path.join(root, "shims/fs.js"),
        crypto: path.join(root, "shims/crypto.js"),
        path: "path-browserify",
    },
    // Provide Buffer/process globals the renderer expects.
    inject: [path.join(root, "shims/globals.mjs")],
    define: { global: "globalThis" },
};

copy_assets();

if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("watching for changes…");
} else {
    await esbuild.build(options);
    console.log("built dist/www");
}
