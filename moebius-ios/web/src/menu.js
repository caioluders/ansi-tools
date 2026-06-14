// menu.js — touch menu driven by menu_data.json (extracted faithfully from
// Moebius's Electron menu). Gives the iOS port access to the full command set
// without a desktop menu bar: a slide-over overlay with submenu navigation.
//
// Command dispatch mirrors how the desktop main process drives the renderer:
//   * "send" actions  -> emit the channel on the renderer bus (same as a desktop
//                        menu item calling win.send(channel)).
//   * "role" actions  -> mapped to the renderer's edit channels.
//   * "emit" actions  -> main-process actions handled here / via the native shell.

const ipc = require("../shims/ipc.js");
const menu_data = require("./menu_data.json");

const ROLE_CHANNEL = {
    undo: "undo", redo: "redo", cut: "cut", copy: "copy",
    paste: "paste", selectall: "select_all",
};

// Optimistic checkbox state, keyed by the channel the item dispatches.
const checkbox_state = Object.create(null);

function emit_renderer(channel, arg) {
    ipc.to_renderer.emit(channel, arg);
}

function run(action) {
    if (!action) return;
    if (action.role) {
        emit_renderer(ROLE_CHANNEL[action.role] || action.role);
    } else if (action.send) {
        emit_renderer(action.send, action.arg);
    } else if (action.emit) {
        run_main(action.emit, action.arg);
    }
}

function run_main(channel) {
    switch (channel) {
        case "new_document":
            emit_renderer("new_document", { columns: 80, rows: 25 });
            break;
        case "open":
        case "open_in_current_window":
            if (ipc.has_native()) ipc.native_post("request_open");
            else dev_open_file();
            break;
        case "preferences":
            require("./modals.js").preferences();
            break;
        case "show_new_connection_window":
            require("./modals.js").connect();
            break;
        default:
            break;
    }
}

// Dev-mode (plain browser) file open via a hidden input, so the menu's Open works
// in the headless tests too.
function dev_open_file() {
    const input = document.createElement("input");
    input.type = "file";
    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            require("../shims/fs.js").seed_file(file.name, bytes);
            emit_renderer("open_file", file.name);
        };
        reader.readAsArrayBuffer(file);
    });
    input.click();
}

// ---------------------------------------------------------------------------
// Overlay UI
// ---------------------------------------------------------------------------

let overlay, panel, title_el, back_btn;
let stack = []; // navigation stack of submenu arrays

function build() {
    overlay = document.createElement("div");
    overlay.id = "mb_menu_overlay";
    overlay.className = "hidden";
    overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });

    panel = document.createElement("div");
    panel.id = "mb_menu_panel";

    const header = document.createElement("div");
    header.id = "mb_menu_header";
    back_btn = document.createElement("button");
    back_btn.id = "mb_menu_back";
    back_btn.textContent = "‹";
    back_btn.addEventListener("pointerdown", (e) => { e.preventDefault(); pop(); });
    title_el = document.createElement("div");
    title_el.id = "mb_menu_title";
    const close_btn = document.createElement("button");
    close_btn.id = "mb_menu_close";
    close_btn.textContent = "✕";
    close_btn.addEventListener("pointerdown", (e) => { e.preventDefault(); close(); });
    header.append(back_btn, title_el, close_btn);

    const list = document.createElement("div");
    list.id = "mb_menu_list";

    panel.append(header, list);
    overlay.append(panel);
    document.body.append(overlay);
}

function render() {
    const list = document.getElementById("mb_menu_list");
    list.innerHTML = "";
    const current = stack[stack.length - 1];
    title_el.textContent = current.label;
    back_btn.style.visibility = stack.length > 1 ? "visible" : "hidden";

    for (const item of current.items) {
        if (item.type === "separator") {
            const sep = document.createElement("div");
            sep.className = "mb_menu_sep";
            list.append(sep);
            continue;
        }
        const row = document.createElement("button");
        row.className = "mb_menu_item";
        const label = document.createElement("span");
        label.textContent = item.label || "";
        row.append(label);

        if (item.accelerator) {
            const acc = document.createElement("span");
            acc.className = "mb_menu_acc";
            acc.textContent = item.accelerator.replace("CmdorCtrl", "⌘").replace("Cmd", "⌘").replace("Alt", "⌥").replace("Shift", "⇧").replace(/\+/g, "");
            row.append(acc);
        }
        if (item.submenu) {
            const chevron = document.createElement("span");
            chevron.className = "mb_menu_chevron";
            chevron.textContent = "›";
            row.append(chevron);
            row.addEventListener("pointerdown", (e) => { e.preventDefault(); push({ label: item.label, items: item.submenu }); });
        } else {
            if (item.type === "checkbox") {
                row.classList.add("mb_menu_checkbox");
                const key = item.action && item.action.send;
                if (key && checkbox_state[key]) row.classList.add("checked");
            }
            row.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                if (item.type === "checkbox" && item.action && item.action.send) {
                    checkbox_state[item.action.send] = !checkbox_state[item.action.send];
                }
                run(item.action);
                close();
            });
        }
        list.append(row);
    }
}

function push(node) { stack.push(node); render(); }
function pop() { if (stack.length > 1) { stack.pop(); render(); } }

function open() {
    if (!overlay) build();
    stack = [{ label: "Menu", items: menu_data }];
    render();
    overlay.classList.remove("hidden");
}
function close() { if (overlay) overlay.classList.add("hidden"); }
function toggle() { if (overlay && !overlay.classList.contains("hidden")) close(); else open(); }

// Reflect a subset of menu checkbox state broadcast by the renderer.
ipc.to_main.on("update_menu_checkboxes", (opts = {}) => {
    if ("ice_colors" in opts) checkbox_state["ice_colors"] = !!opts.ice_colors;
    if ("use_9px_font" in opts) checkbox_state["use_9px_font"] = !!opts.use_9px_font;
});

window.MoebiusMenu = { open, close, toggle, run };

function wire_button() {
    const btn = document.getElementById("mb_menu_btn");
    if (btn) btn.addEventListener("pointerdown", (e) => { e.preventDefault(); toggle(); });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire_button, { once: true });
} else {
    wire_button();
}

module.exports = { open, close, toggle, run };
