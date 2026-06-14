// func_test.mjs — end-to-end exercise of the ported editor in headless Chromium
// with a *simulated native shell*: verifies the native->renderer document flow,
// keyboard input (typing + F-keys), and the save path producing real ANSI bytes.
// Also writes a screenshot to dist/screenshot.png for visual confirmation.

import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;

const root = path.dirname(fileURLToPath(import.meta.url));
const www = path.join(root, "dist/www");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json", ".png": "image/png", ".woff": "font/woff" };

const server = http.createServer(async (req, res) => {
    try {
        let rel = decodeURIComponent(req.url.split("?")[0]);
        if (rel === "/") rel = "/index.html";
        const file = path.join(www, rel);
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(body);
    } catch { res.writeHead(404).end("nf"); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// Simulate the native shell: record postMessage calls and expose them.
await page.addInitScript(() => {
    window.__native = [];
    window.webkit = { messageHandlers: { moebius: { postMessage: (m) => window.__native.push(m) } } };
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

// The renderer should have asked the (simulated) native shell for a document.
const asked = await page.evaluate(() => window.__native.some((m) => m.name === "renderer_ready"));

// Native responds: create a blank 80x25 document.
await page.evaluate(() => window.MoebiusNative.receive("new_document", { columns: 80, rows: 25 }));
await page.waitForTimeout(800);

// Type some text via the input bridge (exercises the key_typed CP437 path).
await page.evaluate(() => {
    for (const ch of "MOEBIUS iOS") window.MoebiusInput.dispatch_key({ key: ch });
});
// Newline + draw a row of F1 box-drawing characters.
await page.evaluate(() => {
    window.MoebiusInput.dispatch_key({ code: "Enter" });
    for (let i = 0; i < 10; i++) window.MoebiusInput.dispatch_key({ code: "F6" }); // shaded blocks set
});
await page.waitForTimeout(300);

const after_typing = await page.evaluate(() => ({
    cursor_x: document.getElementById("cursor_x")?.textContent,
    cursor_y: document.getElementById("cursor_y")?.textContent,
}));

await page.screenshot({ path: path.join(root, "dist/screenshot.png") });

// Trigger Save As via the menu bridge and capture the bytes sent to native.
const save = await page.evaluate(async () => {
    window.__native.length = 0;
    window.MoebiusNative.receive("menu", { channel: "save_as" });
    await new Promise((r) => setTimeout(r, 500));
    const msg = window.__native.find((m) => m.name === "save_file");
    if (!msg) return { saved: false };
    const bin = atob(msg.payload.base64);
    // Look for a SAUCE record and/or ANSI escape sequences in the output.
    const has_sauce = bin.includes("SAUCE");
    const has_escape = bin.includes("\x1b[");
    return { saved: true, path: msg.payload.path, bytes: bin.length, has_sauce, has_escape };
});

await browser.close();
server.close();

console.log("Functional report:");
console.log("  renderer asked native for document:", asked);
console.log("  cursor after typing:", after_typing);
console.log("  save:", JSON.stringify(save));
if (errors.length) console.log("  errors:", errors);

const checks = [
    ["renderer requested document from native", asked],
    ["save produced bytes", save.saved && save.bytes > 0],
    ["save is ANSI (has escape codes)", !!save.has_escape],
    ["save has SAUCE metadata", !!save.has_sauce],
    ["no page errors", errors.length === 0],
];
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? "PASS" : "FAIL"}  ${name}`); if (!pass) ok = false; }
process.exit(ok ? 0 : 1);
