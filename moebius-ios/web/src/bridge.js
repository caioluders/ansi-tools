// bridge.js — the JavaScript re-implementation of the Electron "main process"
// for the iOS port, plus the routing endpoint for messages coming *from* Swift.
//
// Responsibilities:
//   * Handle the renderer->main IPC channels that need real behaviour
//     (document lifecycle, save flow, modals) instead of being forwarded to
//     native as opaque UI state.
//   * Expose `window.MoebiusNative.receive(name, payload)` so the Swift shell can
//     drive the renderer (open a file, run a menu command, seed the clipboard).
//   * Kick off the initial document once the renderer is ready.

const ipc = require("../shims/ipc.js");
const fs = require("../shims/fs.js");
const electron = require("../shims/electron.js");
const { DEFAULT_PREFS } = require("./prefs.js");

const { to_main, to_renderer, native_post, has_native, register_sync } = ipc;

// ---------------------------------------------------------------------------
// renderer -> main handlers
// ---------------------------------------------------------------------------

// The renderer asks main to create a fresh document (Duplicate, Remove iCE
// Colors). With a single WebView we satisfy it in place by handing the spec
// straight back to the renderer.
to_main.on("new_document", (opts) => {
    to_renderer.emit("new_document", opts || {});
});

// Saving control characters: desktop Moebius pops a confirmation modal that, on
// "save anyway", re-issues the save with the flag set. We auto-confirm here; a
// proper native sheet is tracked in ROADMAP.md.
to_main.on("show_controlcharacters", (opts = {}) => {
    to_renderer.emit("process_save", {
        method: opts.method,
        destroy_when_done: opts.destroy_when_done,
        ignore_controlcharacters: true,
    });
});

// Document lifecycle / chrome — forward to native so the shell can update the
// window title, edited dot, recents, etc.
to_main.on("ready", () => native_post("ready"));
to_main.on("destroy", () => native_post("destroy"));
to_main.on("set_file", (opts) => native_post("set_file", opts || {}));
to_main.on("close_modal", () => native_post("close_modal"));
to_main.on("set_modal_menu", () => native_post("set_modal_menu"));
to_main.on("set_doc_menu", () => native_post("set_doc_menu"));
to_main.on("update_menu_checkboxes", (opts) => native_post("update_menu_checkboxes", opts || {}));

// Synchronous channels (sendSync). They block the renderer in Electron; here we
// answer inline. The modals are just progress spinners, so undefined is fine.
register_sync("show_rendering_modal", () => { native_post("show_rendering_modal"); return undefined; });
register_sync("show_connecting_modal", () => { native_post("show_connecting_modal"); return undefined; });

// ---------------------------------------------------------------------------
// native -> renderer / main routing
// ---------------------------------------------------------------------------

const DEFAULT_NEW_DOCUMENT = { columns: 80, rows: 25 };

// Mirror Electron's prefs.send(win): deliver every preference to the renderer as
// its own channel. Must run before the first new_document so the toolbar has its
// fkeys table before the initial render.
let _prefs = Object.assign({}, DEFAULT_PREFS);
function send_prefs(overrides) {
    if (overrides) _prefs = Object.assign({}, _prefs, overrides);
    for (const key of Object.keys(_prefs)) {
        to_renderer.emit(key, _prefs[key]);
    }
}

const native_handlers = {
    // Open a document the native side already read into memory.
    open_file({ path, base64, bytes } = {}) {
        const data = base64 != null ? base64 : bytes;
        if (path != null && data != null) fs.seed_file(path, data);
        to_renderer.emit("open_file", path);
    },
    // Create a new blank document (defaults filled by libtextmode).
    new_document(opts) {
        to_renderer.emit("new_document", opts || DEFAULT_NEW_DOCUMENT);
    },
    // Run any renderer IPC channel by name — this is how native menu items,
    // toolbar buttons and key commands drive the editor (save, export, undo…).
    menu({ channel, opts } = {}) {
        if (channel) to_renderer.emit(channel, opts);
    },
    // Generic passthrough for renderer `on(...)` channels.
    ipc({ channel, opts } = {}) {
        if (channel) to_renderer.emit(channel, opts);
    },
    // Seed the clipboard before the renderer reads it synchronously (paste).
    set_clipboard(payload) {
        electron._set_clipboard(payload || {});
    },
    // Override preferences from native settings (nick, group, …) and re-broadcast.
    set_prefs(payload) {
        send_prefs(payload || {});
    },
};

function receive(name, payload) {
    const handler = native_handlers[name];
    if (!handler) {
        console.warn("MoebiusNative: unhandled message", name, payload);
        return;
    }
    try {
        handler(typeof payload === "string" ? JSON.parse(payload) : payload);
    } catch (err) {
        console.error("MoebiusNative handler error", name, err);
    }
}

window.MoebiusNative = { receive };

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

let booted = false;
function boot() {
    if (booted) return;
    booted = true;
    send_prefs();
    if (has_native()) {
        // Hand control to the native shell: it decides whether to open the file
        // the app was launched with or create a new document, then calls back.
        native_post("renderer_ready");
        // Safety net: if the host never responds, fall back to a blank document.
        setTimeout(() => {
            if (!document.title || document.title === "Untitled") {
                /* leave as-is; native is expected to drive */
            }
        }, 0);
    } else {
        // Dev mode (plain browser): start with a blank document immediately.
        to_renderer.emit("new_document", DEFAULT_NEW_DOCUMENT);
    }
}

module.exports = { boot, receive, DEFAULT_NEW_DOCUMENT };
