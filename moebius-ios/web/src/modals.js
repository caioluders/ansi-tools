// modals.js — in-page dialogs replacing Moebius's separate Electron modal windows
// (SAUCE info, canvas resize, preferences, connect-to-server).
//
// SAUCE and resize are wired into the renderer's existing synchronous round-trip:
// the menu command makes the renderer send_sync("get_sauce_info" / "get_canvas_size")
// with the current values; we answer that by opening the matching dialog, and on
// submit emit "set_sauce_info" / "set_canvas_size" back to the renderer.

const ipc = require("../shims/ipc.js");
const libtextmode = require("../vendor/moebius/libtextmode/libtextmode.js");

function emit(channel, arg) { ipc.to_renderer.emit(channel, arg); }

// A 16x16 CP437 glyph picker; calls onPick(code) with the chosen code point.
function glyph_picker({ title = "Choose Character", current = -1, onPick }) {
    close_any();
    const overlay = document.createElement("div");
    overlay.className = "mb_modal_overlay";
    overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) overlay.remove(); });

    const dialog = document.createElement("div");
    dialog.className = "mb_modal";
    const h = document.createElement("div");
    h.className = "mb_modal_title";
    h.textContent = title;
    dialog.append(h);

    const grid = document.createElement("div");
    grid.className = "mb_glyph_grid";
    for (let code = 0; code < 256; code++) {
        const cell = document.createElement("button");
        cell.className = "mb_glyph_cell";
        if (code === current) cell.classList.add("selected");
        cell.textContent = String.fromCharCode(libtextmode.cp437_to_unicode(code)) || " ";
        cell.title = String(code);
        cell.addEventListener("pointerdown", (e) => { e.preventDefault(); overlay.remove(); onPick(code); });
        grid.append(cell);
    }
    dialog.append(grid);
    overlay.append(dialog);
    document.body.append(overlay);
}

// ---- Generic dialog builder -------------------------------------------------

function open_dialog({ title, fields, submit_label = "OK", onSubmit }) {
    close_any();
    const overlay = document.createElement("div");
    overlay.className = "mb_modal_overlay";
    overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) overlay.remove(); });

    const dialog = document.createElement("div");
    dialog.className = "mb_modal";

    const h = document.createElement("div");
    h.className = "mb_modal_title";
    h.textContent = title;
    dialog.append(h);

    const inputs = {};
    for (const f of fields) {
        const wrap = document.createElement("label");
        wrap.className = "mb_modal_field";
        const lbl = document.createElement("span");
        lbl.textContent = f.label;
        wrap.append(lbl);
        const input = f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
        if (f.type !== "textarea") input.type = f.type || "text";
        if (f.value != null) input.value = f.value;
        if (f.min != null) input.min = f.min;
        if (f.max != null) input.max = f.max;
        input.className = "mb_modal_input";
        wrap.append(input);
        inputs[f.id] = input;
        dialog.append(wrap);
    }

    const actions = document.createElement("div");
    actions.className = "mb_modal_actions";
    const cancel = document.createElement("button");
    cancel.className = "mb_modal_btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("pointerdown", (e) => { e.preventDefault(); overlay.remove(); });
    const ok = document.createElement("button");
    ok.className = "mb_modal_btn primary";
    ok.textContent = submit_label;
    ok.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const values = {};
        for (const id of Object.keys(inputs)) values[id] = inputs[id].value;
        overlay.remove();
        onSubmit(values);
    });
    actions.append(cancel, ok);
    dialog.append(actions);

    overlay.append(dialog);
    document.body.append(overlay);
    return overlay;
}

function close_any() {
    for (const el of document.querySelectorAll(".mb_modal_overlay")) el.remove();
}

// ---- Specific dialogs -------------------------------------------------------

function sauce(data = {}) {
    open_dialog({
        title: "SAUCE Info",
        fields: [
            { id: "title", label: "Title", value: data.title || "" },
            { id: "author", label: "Author", value: data.author || "" },
            { id: "group", label: "Group", value: data.group || "" },
            { id: "comments", label: "Comments", type: "textarea", value: data.comments || "" },
        ],
        onSubmit: (v) => emit("set_sauce_info", v),
    });
}

function resize(data = {}) {
    open_dialog({
        title: "Canvas Size",
        fields: [
            { id: "columns", label: "Columns", type: "number", min: 1, max: 4000, value: data.columns || 80 },
            { id: "rows", label: "Rows", type: "number", min: 1, max: 4000, value: data.rows || 25 },
        ],
        submit_label: "Resize",
        onSubmit: (v) => {
            const columns = Math.max(1, parseInt(v.columns, 10) || 80);
            const rows = Math.max(1, parseInt(v.rows, 10) || 25);
            emit("set_canvas_size", { columns, rows });
        },
    });
}

function preferences() {
    open_dialog({
        title: "Preferences",
        fields: [
            { id: "nick", label: "Nick", value: "" },
            { id: "group", label: "Group", value: "" },
        ],
        submit_label: "Save",
        onSubmit: (v) => { emit("nick", v.nick); emit("group", v.group); },
    });
}

function connect() {
    open_dialog({
        title: "Connect to Server",
        fields: [
            { id: "server", label: "Server", value: "" },
            { id: "pass", label: "Password", type: "password", value: "" },
        ],
        submit_label: "Connect",
        onSubmit: (v) => emit("connect_to_server", { server: v.server, pass: v.pass }),
    });
}

// Editing an F-key character set entry (or the custom block when num === -1).
function fkey_prefs(data = {}) {
    const bridge = require("./bridge.js");
    glyph_picker({
        title: data.num === -1 ? "Custom Block Character" : `F-key ${data.num + 1} Character`,
        current: data.current,
        onPick: (code) => {
            if (data.num === -1) bridge.set_custom_block(code);
            else bridge.update_fkey(data.fkey_index, data.num, code);
        },
    });
}

// Answer the renderer's synchronous requests by opening the right dialog.
ipc.register_sync("get_sauce_info", (data) => { sauce(data); return undefined; });
ipc.register_sync("get_canvas_size", (data) => { resize(data); return undefined; });
ipc.register_sync("fkey_prefs", (data) => { fkey_prefs(data); return undefined; });

window.MoebiusModals = { sauce, resize, preferences, connect, fkey_prefs, glyph_picker };

module.exports = { sauce, resize, preferences, connect, fkey_prefs, glyph_picker };
