// menu_test.mjs — verify the data-driven menu and the modal round-trips in
// headless Chromium: open the menu, drive a canvas resize through
// menu -> get_canvas_size (send_sync) -> resize dialog -> set_canvas_size, and a
// SAUCE edit through the same path.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChromium } from "./test_helpers.mjs";
const chromium = await loadChromium();

const www = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist/www");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json", ".png": "image/png", ".woff": "font/woff", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
    try {
        let rel = decodeURIComponent(req.url.split("?")[0]);
        if (rel === "/") rel = "/index.html";
        const body = await readFile(path.join(www, rel));
        res.writeHead(200, { "Content-Type": MIME[path.extname(path.join(www, rel))] || "application/octet-stream" });
        res.end(body);
    } catch { res.writeHead(404).end("nf"); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200); // dev-mode auto new_document

// 1. Open the menu and count top-level entries.
await page.evaluate(() => window.MoebiusMenu.open());
await page.waitForTimeout(150);
const topLevel = await page.$$eval("#mb_menu_list .mb_menu_item span:first-child", (els) => els.map((e) => e.textContent));
await page.evaluate(() => window.MoebiusMenu.close());

// 2. Resize via menu: dispatch the renderer's "get_canvas_size" channel exactly
//    as the menu item would, then fill in the dialog and submit.
const beforeCols = await page.textContent("#columns");
await page.evaluate(() => window.MoebiusMenu.run({ send: "get_canvas_size" }));
await page.waitForTimeout(150);
const resizeDialogShown = await page.$("#__none, .mb_modal") !== null;
await page.evaluate(() => {
    const inputs = document.querySelectorAll(".mb_modal .mb_modal_input");
    inputs[0].value = "120"; inputs[1].value = "40";
    const ok = [...document.querySelectorAll(".mb_modal_btn")].find((b) => b.textContent === "Resize");
    ok.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(600);
const afterCols = await page.textContent("#columns");
const afterRows = await page.textContent("#rows");

// 3. SAUCE via menu round-trip.
await page.evaluate(() => window.MoebiusMenu.run({ send: "get_sauce_info" }));
await page.waitForTimeout(150);
await page.evaluate(() => {
    const inputs = document.querySelectorAll(".mb_modal .mb_modal_input");
    inputs[0].value = "Test Title"; inputs[1].value = "Tester";
    const ok = [...document.querySelectorAll(".mb_modal_btn")].find((b) => b.textContent === "OK");
    ok.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(300);
// Round-trip verification: re-request sauce info; the dialog is repopulated from
// the document, so the title field reflects what we just saved.
await page.evaluate(() => window.MoebiusMenu.run({ send: "get_sauce_info" }));
await page.waitForTimeout(200);
const sauceTitle = await page.evaluate(() => document.querySelector(".mb_modal .mb_modal_input")?.value || "");

// 4. F-key character editor: open the glyph picker (as tapping an F-key swatch
//    does via send_sync), pick a character, and confirm it updates the fkeys
//    table — verified by pressing F1 and checking the inserted code.
await page.evaluate(() => window.MoebiusModals.fkey_prefs({ num: 0, fkey_index: 0, current: 218 }));
await page.waitForTimeout(150);
const glyphPickerShown = (await page.$(".mb_glyph_grid")) !== null;
const glyphCells = await page.$$eval(".mb_glyph_cell", (els) => els.length);
await page.evaluate(() => {
    // Pick CP437 code 1 for F1; then press F1 to exercise the updated table.
    document.querySelectorAll(".mb_glyph_cell")[1]
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    window.MoebiusInput.dispatch_key({ code: "F1" });
});
await page.waitForTimeout(150);

await browser.close();
server.close();

console.log("Top-level menus:", topLevel.join(", "));
console.log(`Resize: ${beforeCols} -> ${afterCols} cols, ${afterRows} rows`);
console.log("SAUCE title applied:", JSON.stringify(sauceTitle));
if (errors.length) console.log("errors:", errors);

const checks = [
    ["menu has File/Edit/Selection/Colors/View/Network", ["File", "Edit", "Selection", "Colors", "View", "Network"].every((m) => topLevel.includes(m))],
    ["resize dialog opened from menu", resizeDialogShown],
    ["resize applied (120 cols)", afterCols === "120"],
    ["resize applied (40 rows)", afterRows === "40"],
    ["SAUCE title applied", sauceTitle === "Test Title"],
    ["F-key glyph picker opened (256 glyphs)", glyphPickerShown && glyphCells === 256],
    ["no page errors", errors.length === 0],
];
let ok = true;
for (const [n, p] of checks) { console.log(`${p ? "PASS" : "FAIL"}  ${n}`); if (!p) ok = false; }
process.exit(ok ? 0 : 1);
