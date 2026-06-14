// smoke_test.mjs — load the built bundle in headless Chromium and verify the
// Moebius renderer boots: a new document is created and the canvas layers render.
//
//   node smoke_test.mjs
//
// Exits non-zero on console errors / page errors / missing canvas.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChromium } from "./test_helpers.mjs";
const chromium = await loadChromium();

const root = path.dirname(fileURLToPath(import.meta.url));
const www = path.join(root, "dist/www");

const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".map": "application/json", ".png": "image/png", ".woff": "font/woff",
};

const server = http.createServer(async (req, res) => {
    try {
        let rel = decodeURIComponent(req.url.split("?")[0]);
        if (rel === "/") rel = "/index.html";
        const file = path.join(www, rel);
        if (!file.startsWith(www)) { res.writeHead(403).end(); return; }
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(body);
    } catch {
        res.writeHead(404).end("not found");
    }
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on("console", (msg) => { if (msg.type() === "error") errors.push("console: " + msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto(url, { waitUntil: "networkidle" });

// Give the async font fetch + first render a moment.
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
    const ice = document.getElementById("ice_color_container");
    return {
        title: document.title,
        columns: document.getElementById("columns")?.textContent,
        rows: document.getElementById("rows")?.textContent,
        font_name: document.getElementById("font_name")?.textContent,
        render_canvases: ice ? ice.querySelectorAll("canvas").length : 0,
        has_native_bridge: typeof window.MoebiusNative === "object",
        has_input_bridge: typeof window.MoebiusInput === "object",
        mobile_bar: !!document.getElementById("mobile_bar"),
        charmap_cells: document.querySelectorAll("#mobile_charmap .mc_cell").length,
    };
});

await browser.close();
server.close();

console.log("Smoke report:", JSON.stringify(report, null, 2));

const checks = [
    ["new document columns", report.columns === "80"],
    ["new document rows", report.rows === "25"],
    ["render canvas present", report.render_canvases > 0],
    ["native bridge exposed", report.has_native_bridge],
    ["input bridge exposed", report.has_input_bridge],
    ["CP437 palette built", report.charmap_cells === 256],
];

let ok = true;
for (const [name, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
}
if (errors.length) {
    console.log("\nPage errors:");
    for (const e of errors) console.log("  " + e);
    ok = false;
}

process.exit(ok ? 0 : 1);
