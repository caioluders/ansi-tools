// bootstrap.js — bundle entry point.
//
// Order matters:
//   1. bridge.js installs the in-process IPC bus and window.MoebiusNative before
//      the renderer registers any `on(...)` handlers.
//   2. controller.js pulls in the entire Moebius renderer (document model, tools,
//      ui, input) and registers its IPC handlers.
//   3. touch_input.js layers the touch / mobile-keyboard adaptation on top.
//   4. bridge.boot() asks the native shell for the initial document (or opens a
//      blank one in dev-mode browser).

const bridge = require("./bridge.js");
require("../vendor/moebius/controller.js");
require("./touch_input.js");
require("./menu.js");
require("./modals.js");

function start() { bridge.boot(); }

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
    start();
}
