// electron-remote.js — stand-in for the `@electron/remote` module.
//
// Moebius uses @electron/remote for three things in the renderer:
//   * the current BrowserWindow (only its id, plus title/edited bookkeeping),
//   * the current webContents zoom factor, and
//   * synchronous native dialogs (message boxes, open/save panels).
//
// On iOS the open/save *flow* is inverted (see shims/fs.js): saving is decoupled
// from picking a path, so the save panel just returns the suggested filename and
// the real native save happens when bytes are written. Message boxes map onto the
// WebView's synchronous confirm/alert panels, which the Swift WKUIDelegate renders
// as native alerts.

const ipc = require("./ipc");

let _zoom_factor = 1;

const current_window = {
    id: 1,
    getPosition() { return [0, 0]; },
    setPosition() {},
    setTitle(title) { ipc.native_post("set_title", { title }); },
    getTitle() { return document.title; },
    setRepresentedFilename(path) { ipc.native_post("set_represented_filename", { path }); },
    setDocumentEdited(edited) { ipc.native_post("set_document_edited", { edited }); },
    isDestroyed() { return false; },
    show() {},
    focus() {},
};

const current_web_contents = {
    get zoomFactor() { return _zoom_factor; },
    set zoomFactor(value) {
        _zoom_factor = value;
        ipc.native_post("set_zoom", { factor: value });
        // Apply visually even in dev-mode browser.
        try { document.body.style.zoom = String(value); } catch (err) { /* ignore */ }
    },
    setZoomFactor(value) { this.zoomFactor = value; },
    getZoomFactor() { return _zoom_factor; },
};

function getCurrentWindow() { return current_window; }
function getCurrentWebContents() { return current_web_contents; }

const dialog = {
    // Returns the index of the chosen button. The WebView confirm/alert panels
    // are synchronous from JS, so this preserves Moebius's blocking semantics.
    showMessageBoxSync(win, opts) {
        if (typeof win === "object" && opts === undefined) { opts = win; }
        opts = opts || {};
        const buttons = opts.buttons || ["OK"];
        const text = [opts.message, opts.detail].filter(Boolean).join("\n\n");
        if (buttons.length <= 1) {
            try { window.alert(text); } catch (err) { /* ignore */ }
            return 0;
        }
        // Two- and three-button prompts collapse onto confirm(): OK selects the
        // default button, Cancel selects the cancel button. (A richer native
        // multi-button sheet is tracked in ROADMAP.md.)
        const ok = (() => { try { return window.confirm(text); } catch (err) { return true; } })();
        const default_id = (opts.defaultId != null) ? opts.defaultId : 0;
        const cancel_id = (opts.cancelId != null) ? opts.cancelId : buttons.length - 1;
        return ok ? default_id : cancel_id;
    },

    // Opens are always initiated from the native side on iOS (document picker),
    // which then pushes an `open_file` message, so the renderer-driven open panel
    // is a no-op.
    showOpenDialogSync() {
        ipc.native_post("request_open");
        return undefined;
    },

    // Returns the suggested path/filename. The actual file isn't created here;
    // writing bytes (fs.writeFileSync) triggers the native save/share sheet.
    showSaveDialogSync(win, opts) {
        if (typeof win === "object" && opts === undefined) { opts = win; }
        opts = opts || {};
        return opts.defaultPath || "Untitled.ans";
    },
};

const app = {
    addRecentDocument() {},
    getPath() { return ""; },
};

module.exports = { getCurrentWindow, getCurrentWebContents, dialog, app };
