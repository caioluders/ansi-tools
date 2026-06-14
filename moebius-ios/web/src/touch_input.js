// touch_input.js — the touch / mobile-keyboard adaptation layer.
//
// Moebius is a keyboard- and mouse-driven editor. The good news (see the port
// notes in ROADMAP.md) is that its pointer handling already uses Pointer Events,
// so one-finger drawing works untouched. This module fills the remaining gaps a
// touch device has:
//
//   1. Keys a soft keyboard can't send. The on-screen control bar dispatches
//      synthetic DOM KeyboardEvents that flow through Moebius's existing global
//      keydown handler exactly like a hardware key (F1–F12, arrows, Tab, Esc,
//      Enter, Backspace, Delete, undo/redo).
//
//   2. Literal CP437 text entry. An "ABC" button summons the iOS soft keyboard
//      via a hidden field and translates `beforeinput` into key_typed events; a
//      CP437 glyph palette covers the extended characters no keyboard has.
//
//   3. No right mouse button. A sticky "2nd" toggle re-dispatches a touch as a
//      right-button pointer event (used for background colour / erase).
//
//   4. Gesture arbitration. One finger draws; two fingers pan and pinch-zoom,
//      with any in-progress stroke cancelled so a pinch never paints.

const keyboard = require("../vendor/moebius/document/input/keyboard.js");
const mouse = require("../vendor/moebius/document/input/mouse.js");
const ui = require("../vendor/moebius/document/ui/ui.js");
const libtextmode = require("../vendor/moebius/libtextmode/libtextmode.js");

// ---------------------------------------------------------------------------
// Synthetic keyboard
// ---------------------------------------------------------------------------

// Dispatch a keydown that mimics a hardware key so Moebius's handler (attached
// to document.body, capture phase) processes it normally.
function dispatch_key({ code = "", key = "", ctrl = false, alt = false, shift = false, meta = false } = {}) {
    const event = new KeyboardEvent("keydown", {
        code,
        key: key || code,
        ctrlKey: ctrl,
        altKey: alt,
        shiftKey: shift,
        metaKey: meta,
        bubbles: true,
        cancelable: true,
    });
    document.body.dispatchEvent(event);
}

function wire_keys(root) {
    for (const el of root.querySelectorAll(".mb_key[data-code]")) {
        el.addEventListener("pointerdown", (event) => {
            event.preventDefault(); // don't steal focus / scroll
            dispatch_key({
                code: el.dataset.code,
                key: el.dataset.key || "",
                ctrl: el.dataset.ctrl === "true",
                alt: el.dataset.alt === "true",
                shift: el.dataset.shift === "true",
            });
        });
    }
}

// ---------------------------------------------------------------------------
// Soft keyboard capture (literal typing)
// ---------------------------------------------------------------------------

function setup_soft_keyboard() {
    const field = document.getElementById("mobile_text_capture");
    const toggle = document.getElementById("mb_keyboard");
    if (!field || !toggle) return;

    const reset = () => { field.value = ""; };

    toggle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (document.activeElement === field) {
            field.blur();
            toggle.classList.remove("active");
        } else {
            reset();
            field.focus({ preventScroll: true });
            toggle.classList.add("active");
        }
    });
    field.addEventListener("blur", () => toggle.classList.remove("active"));

    // beforeinput is the most reliable signal on iOS for soft-keyboard edits.
    field.addEventListener("beforeinput", (event) => {
        switch (event.inputType) {
            case "insertText":
            case "insertCompositionText":
                if (event.data) {
                    for (const ch of event.data) type_character(ch);
                }
                break;
            case "deleteContentBackward":
                dispatch_key({ code: "Backspace" });
                break;
            case "insertLineBreak":
            case "insertParagraph":
                dispatch_key({ code: "Enter" });
                break;
            default:
                break;
        }
        event.preventDefault();
        reset();
    });
}

// Insert a single character: map Unicode -> CP437 and feed Moebius directly so
// the full code page (not just ASCII) round-trips.
function type_character(ch) {
    const code = libtextmode.unicode_to_cp437(ch.charCodeAt(0));
    if (code) keyboard.emit("key_typed", code);
}

// ---------------------------------------------------------------------------
// CP437 glyph palette
// ---------------------------------------------------------------------------

function setup_charmap() {
    const panel = document.getElementById("mobile_charmap");
    const toggle = document.getElementById("mb_chars");
    if (!panel || !toggle) return;

    // 16x16 grid of every CP437 code point, rendered with the Unicode glyph.
    for (let code = 0; code < 256; code++) {
        const cell = document.createElement("button");
        cell.className = "mc_cell";
        cell.textContent = String.fromCharCode(libtextmode.cp437_to_unicode(code)) || " ";
        cell.title = String(code);
        cell.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            keyboard.emit("key_typed", code);
        });
        panel.appendChild(cell);
    }

    toggle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const showing = panel.classList.toggle("hidden");
        toggle.classList.toggle("active", !showing);
    });
}

// ---------------------------------------------------------------------------
// Pointer gestures: secondary draw, two-finger pan + pinch-zoom
// ---------------------------------------------------------------------------

let secondary_mode = false;
const active_touches = new Map(); // pointerId -> {x, y}
let gesturing = false;            // true while >=2 fingers are down
let pinch_base = 0;
let pan_last = null;

function setup_secondary_toggle() {
    const toggle = document.getElementById("mb_secondary");
    if (!toggle) return;
    toggle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        secondary_mode = !secondary_mode;
        toggle.classList.toggle("active", secondary_mode);
    });
}

function touch_centroid() {
    let x = 0, y = 0;
    for (const p of active_touches.values()) { x += p.x; y += p.y; }
    const n = active_touches.size || 1;
    return { x: x / n, y: y / n };
}

function touch_spread() {
    const pts = [...active_touches.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function setup_gestures() {
    const viewport = document.getElementById("viewport");

    // Capture phase on document: runs before Moebius's own listeners, so we can
    // suppress drawing during a gesture or rewrite a touch into a right-click.
    document.addEventListener("pointerdown", (event) => {
        if (event.__moebius_synth || event.pointerType !== "touch") return;
        active_touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (active_touches.size >= 2) {
            // Second finger: abort any stroke and switch to pan/zoom.
            mouse.escape();
            gesturing = true;
            pinch_base = touch_spread();
            pan_last = touch_centroid();
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        if (secondary_mode) {
            // Rewrite this single touch as a right-button press.
            event.stopPropagation();
            const synth = new PointerEvent("pointerdown", {
                button: 2, buttons: 2,
                clientX: event.clientX, clientY: event.clientY,
                pointerId: event.pointerId, pointerType: "mouse",
                bubbles: true, cancelable: true,
            });
            synth.__moebius_synth = true;
            event.target.dispatchEvent(synth);
        }
    }, true);

    document.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "touch" || !active_touches.has(event.pointerId)) return;
        active_touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (!gesturing) return;
        event.stopPropagation();
        event.preventDefault();

        // Pan by centroid delta.
        const centroid = touch_centroid();
        if (pan_last && viewport) {
            viewport.scrollLeft -= (centroid.x - pan_last.x);
            viewport.scrollTop -= (centroid.y - pan_last.y);
        }
        pan_last = centroid;

        // Pinch zoom in coarse steps (Moebius zoom is stepped).
        const spread = touch_spread();
        if (pinch_base && spread) {
            const ratio = spread / pinch_base;
            if (ratio > 1.18) { ui.zoom_in(); pinch_base = spread; }
            else if (ratio < 0.85) { ui.zoom_out(); pinch_base = spread; }
        }
    }, true);

    const end = (event) => {
        if (event.pointerType !== "touch") return;
        active_touches.delete(event.pointerId);
        if (gesturing) { event.stopPropagation(); }
        // Stay suppressed until every finger lifts, so a lingering finger doesn't
        // suddenly start drawing as a pinch ends.
        if (active_touches.size === 0) { gesturing = false; pan_last = null; pinch_base = 0; }
    };
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
}

// ---------------------------------------------------------------------------
// Bring-up
// ---------------------------------------------------------------------------

function is_touch_device() {
    try {
        return window.matchMedia("(pointer: coarse)").matches || ("ontouchstart" in window);
    } catch (err) {
        return false;
    }
}

function init() {
    const bar = document.getElementById("mobile_bar");
    // Show the touch UI on touch devices (and always inside the native shell).
    const native = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.moebius);
    if (bar && (native || is_touch_device())) {
        bar.classList.remove("hidden");
        document.body.classList.add("mobile");
    }
    wire_keys(document);
    setup_soft_keyboard();
    setup_charmap();
    setup_secondary_toggle();
    setup_gestures();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}

// Small surface for the native shell / hardware key commands to drive input.
window.MoebiusInput = {
    dispatch_key,
    type_character,
    set_secondary(on) {
        secondary_mode = !!on;
        const toggle = document.getElementById("mb_secondary");
        if (toggle) toggle.classList.toggle("active", secondary_mode);
    },
};

module.exports = { dispatch_key, type_character };
