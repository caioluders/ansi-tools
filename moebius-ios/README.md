# Moebius for iOS

A port of [**Moebius**](https://github.com/blocktronics/moebius) — Andy Herbert's
modern ANSI/ASCII art editor — to iPhone and iPad.

Rather than reimplement the editor from scratch, this port **reuses Moebius's own
JavaScript** (the document model, rendering, tools, and `libtextmode` ANSI/XBin
engine) and runs it inside a native `WKWebView`. The Electron desktop layer is
replaced by a thin set of browser/iOS shims and a native Swift shell. This gives
us a path to full feature parity while writing only the genuinely-native parts
(files, dialogs, clipboard, and — most importantly — a touch input model).

> Status: **working web layer, verified end-to-end in headless Chromium**
> (boots, renders, accepts typed + F-key input, saves valid ANSI + SAUCE), plus a
> native iOS shell scaffold. See [ROADMAP.md](ROADMAP.md) for what's done and
> what's next.

```
┌──────────────────────────────────────────────────────────────┐
│  iOS app (Swift / UIKit)                  moebius-ios/ios      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ EditorViewController  →  WKWebView                      │  │
│  │   • WKScriptMessageHandler  (web → native)              │  │
│  │   • window.MoebiusNative.receive()  (native → web)      │  │
│  │   • file open/save, alerts, clipboard, keyboard avoid   │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────┘
                                 │  postMessage / evaluateJavaScript
┌───────────────────────────────┴──────────────────────────────┐
│  Web layer (bundled JS)                   moebius-ios/web      │
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐  │
│  │ shims/       │   │ src/bridge.js │   │ src/touch_input  │  │
│  │  electron    │   │ (JS "main     │   │ on-screen keys,  │  │
│  │  @e/remote   │←→ │  process" +   │←→ │ CP437 palette,   │  │
│  │  fs, crypto  │   │  IPC bus +    │   │ pan/zoom/right-  │  │
│  │  Buffer      │   │  native API)  │   │ button gestures  │  │
│  └──────┬───────┘   └───────┬───────┘   └────────┬─────────┘  │
│         └───────────────────┴────────────────────┘            │
│                         vendored Moebius renderer             │
│          controller.js · document/* · libtextmode/*           │
└───────────────────────────────────────────────────────────────┘
```

## Repository layout

```
moebius-ios/
├── web/                        the WKWebView payload (build with Node, runs anywhere)
│   ├── vendor/moebius/         vendored Moebius renderer source (Apache-2.0)
│   ├── shims/                  electron / @electron/remote / fs / crypto / globals
│   ├── src/
│   │   ├── bridge.js           JS re-implementation of the Electron main process
│   │   ├── prefs.js            default preferences (fkeys table, etc.)
│   │   ├── touch_input.js      touch + mobile-keyboard adaptation layer
│   │   ├── index.html          host page + on-screen control bar
│   │   └── mobile.css          control-bar / CP437-palette styling
│   ├── build.mjs               esbuild pipeline → dist/www
│   ├── smoke_test.mjs          headless boot/render check
│   └── func_test.mjs           headless type/F-key/save check + screenshot
└── ios/                        native iOS app (build on a Mac with Xcode)
    ├── project.yml             XcodeGen spec
    ├── Sources/                AppDelegate, SceneDelegate, EditorViewController…
    └── Resources/              Info.plist, entitlements
```

## Building & running

### Web layer (works on Linux/macOS/CI — no Apple tooling required)

```bash
cd moebius-ios/web
npm install
npm run build          # → dist/www (index.html, moebius.bundle.js, assets)
```

Verify it without a device:

```bash
npx playwright install chromium     # once
node smoke_test.mjs                 # boots + renders an 80×25 document
node func_test.mjs                  # types text, presses F-keys, saves ANSI;
                                    # writes dist/screenshot.png
```

### iOS app (requires a Mac + Xcode)

```bash
brew install xcodegen
cd moebius-ios/ios
xcodegen generate
open Moebius.xcodeproj            # set your signing team, then Run
```

The Xcode project runs the web build automatically as a pre-build step and embeds
`web/dist/www` into the app bundle.

## Input model: cursor & keyboard on touch

Moebius is a keyboard- and mouse-centric editor, so the input model is the
hardest and most important part of a touch port. The good news, discovered while
studying the source: **Moebius already uses Pointer Events** for drawing, which
are unified across mouse/pen/touch — so one-finger drawing, sampling, and cursor
placement work on touch with no changes. What a touch device *can't* provide is
synthesized by `src/touch_input.js`:

| Desktop interaction | Touch replacement |
| --- | --- |
| Move cursor (arrow keys) | On-screen **D-pad**, or tap the canvas to place the cursor |
| **F1–F12** half-block / character brushes | F-key row on the on-screen control bar |
| Type CP437 letters/numbers | **ABC ⌨** summons the iOS soft keyboard; `beforeinput` is translated to `key_typed` |
| Type extended CP437 glyphs (no key exists) | **CP437 ▦** opens a 16×16 glyph palette |
| Tab / Esc / Enter / Backspace / Delete | Dedicated control-bar keys |
| Undo / Redo | Control-bar buttons (⌫ synthesizes Ctrl+Z/Y) |
| **Right mouse button** (background colour / erase) | Sticky **2nd** toggle re-dispatches a touch as a right-button pointer event |
| Pinch-to-zoom / scroll | **Two-finger** pinch zooms and pans; one finger always draws. A second finger cancels any in-progress stroke so a pinch never paints |
| Hardware keyboard (iPad) | Flows straight into Moebius's existing global `keydown` handler; ⌘-shortcuts (New/Open/Save/Export) handled natively |

All on-screen keys work by dispatching a **synthetic `KeyboardEvent`** with the
correct `code`/`key`, so they travel through the *exact same* code path as a real
hardware key — there is no parallel input implementation to keep in sync.

The keyboard-avoidance logic in the native shell resizes the web view above the
soft keyboard so the control bar and canvas are never hidden.

See [ROADMAP.md](ROADMAP.md#input--touch) for refinements still planned
(visual cursor affordances, marquee selection handles, per-tool gesture tuning).

## Licensing & attribution

Moebius is © Andy Herbert and licensed under **Apache-2.0**; the vendored sources
under `web/vendor/moebius/` retain the upstream `LICENSE.txt`. This port's own
code follows the repository license. The bundled IBM VGA fonts originate from the
Moebius project (and ultimately the [Ultimate Oldschool PC Font
Pack](https://int10h.org/oldschool-pc-fonts/)).
