// test_helpers.mjs — resolve Playwright's chromium whether it's installed locally
// (CI: `npm i playwright`) or available globally (dev container).
export async function loadChromium() {
    const candidates = [
        "playwright",
        "playwright-core",
        "/opt/node22/lib/node_modules/playwright/index.js",
    ];
    for (const c of candidates) {
        try {
            const mod = await import(c);
            const chromium = mod.chromium || (mod.default && mod.default.chromium);
            if (chromium) return chromium;
        } catch { /* try next */ }
    }
    throw new Error("Playwright not found. Run: npm i playwright && npx playwright install chromium");
}
