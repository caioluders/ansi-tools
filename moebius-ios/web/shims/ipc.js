// ipc.js — low-level message plumbing for the Moebius iOS port.
//
// In the desktop Electron app the renderer talks to the main process through
// `ipcRenderer`/`ipcMain`, and to the OS through `@electron/remote`. In the iOS
// port there is a single WKWebView JavaScript realm, so we replace those with:
//
//   * an in-process event bus (`to_renderer` / `to_main`) that connects the
//     renderer modules to a JavaScript re-implementation of the bits of the
//     Electron "main process" we still need (see src/bridge.js), and
//   * a thin native channel (`native_post`) that forwards genuinely-native
//     requests (file save, alerts, clipboard, open URL) to the Swift shell via
//     `window.webkit.messageHandlers`.
//
// This module deliberately has no dependencies on the renderer or the bridge so
// that every shim can require it without creating a cycle.

const { EventEmitter } = require("events");

// main -> renderer (the equivalent of webContents.send / ipcRenderer.on)
const to_renderer = new EventEmitter();
// renderer -> main (the equivalent of ipcRenderer.send / ipcMain.on)
const to_main = new EventEmitter();
to_renderer.setMaxListeners(0);
to_main.setMaxListeners(0);

// Synchronous request handlers, keyed by channel. Electron's sendSync is a
// blocking round-trip to the main process; here we answer it inline from JS.
const sync_handlers = Object.create(null);
function register_sync(channel, fn) {
    sync_handlers[channel] = fn;
}
function send_sync(channel, opts) {
    const fn = sync_handlers[channel];
    return fn ? fn(opts) : undefined;
}

// Forward a message to the native (Swift) side. Returns false when running in a
// plain browser (development mode) so callers can fall back gracefully.
function native_post(name, payload = {}) {
    try {
        const wk = window.webkit;
        if (wk && wk.messageHandlers && wk.messageHandlers.moebius) {
            wk.messageHandlers.moebius.postMessage({ name, payload });
            return true;
        }
    } catch (err) {
        console.error("native_post failed", err);
    }
    return false;
}

// True when a native host is present (vs. dev-mode browser).
function has_native() {
    try {
        return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.moebius);
    } catch (err) {
        return false;
    }
}

module.exports = {
    to_renderer,
    to_main,
    register_sync,
    send_sync,
    native_post,
    has_native,
};
