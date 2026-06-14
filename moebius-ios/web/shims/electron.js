// electron.js — browser/WKWebView stand-in for the Electron `electron` module.
//
// The Moebius renderer only touches a small slice of Electron's API surface:
//   * ipcRenderer  — message bus to the "main process"
//   * clipboard    — copy/paste of blocks and text
//   * shell        — opening external links
// Each is mapped onto the in-process bus (ipc.js) or the native bridge.

const ipc = require("./ipc");

// ---------------------------------------------------------------------------
// ipcRenderer
// ---------------------------------------------------------------------------
const ipcRenderer = {
    on(channel, listener) {
        // Electron listeners receive (event, ...args); the renderer ignores the
        // event object, so we pass a stub.
        ipc.to_renderer.on(channel, (opts) => listener({}, opts));
        return ipcRenderer;
    },
    once(channel, listener) {
        ipc.to_renderer.once(channel, (opts) => listener({}, opts));
        return ipcRenderer;
    },
    removeListener(channel, listener) {
        // Listeners are wrapped above, so exact removal isn't supported. The
        // renderer registers once at startup and never removes, so this is a
        // no-op in practice.
        return ipcRenderer;
    },
    removeAllListeners(channel) {
        if (channel) ipc.to_renderer.removeAllListeners(channel);
        else ipc.to_renderer.removeAllListeners();
        return ipcRenderer;
    },
    send(channel, opts) {
        // Channels the JS "main process" (src/bridge.js) handles are emitted on
        // the bus; anything it doesn't claim (menu/touchbar/checkbox state) is
        // forwarded to the native shell so the iOS UI can mirror it.
        const handled = ipc.to_main.emit(channel, opts);
        if (!handled) ipc.native_post("ipc", { channel, opts });
    },
    sendSync(channel, opts) {
        return ipc.send_sync(channel, opts);
    },
};

// ---------------------------------------------------------------------------
// clipboard
//
// Electron's clipboard API is synchronous and supports an HTML payload that
// Moebius (ab)uses to round-trip a JSON description of copied blocks alongside
// the plain text. We keep an in-process copy so block fidelity survives
// in-app copy/paste, and best-effort mirror plain text to the system clipboard.
// ---------------------------------------------------------------------------
let _clip_text = "";
let _clip_html = "";
const clipboard = {
    write({ text = "", html = "" } = {}) {
        _clip_text = text;
        _clip_html = html;
        ipc.native_post("clipboard_write", { text, html });
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(() => {});
            }
        } catch (err) { /* ignore */ }
    },
    writeText(text) {
        this.write({ text, html: "" });
    },
    readText() {
        return _clip_text;
    },
    readHTML() {
        return _clip_html;
    },
};

// Called by the native side (paste) to seed the clipboard before the renderer
// reads it synchronously.
function set_clipboard({ text = "", html = "" } = {}) {
    _clip_text = text;
    _clip_html = html;
}

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------
const shell = {
    openExternal(url) {
        ipc.native_post("open_external", { url });
        return Promise.resolve();
    },
    showItemInFolder(path) {
        // No "reveal in folder" concept on iOS; surface in the Files app instead.
        ipc.native_post("show_item_in_folder", { path });
    },
};

module.exports = { ipcRenderer, clipboard, shell, _set_clipboard: set_clipboard };
