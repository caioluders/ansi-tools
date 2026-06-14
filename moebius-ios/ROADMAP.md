# Moebius iOS — Roadmap

Goal: **full feature parity** with desktop Moebius on iPhone and iPad, by reusing
the Moebius renderer in a WKWebView and replacing only the native layer.

## Done

- [x] Architecture: vendored Moebius renderer bundled for the browser (esbuild).
- [x] Electron replacement shims: `electron`, `@electron/remote`, `fs`, `crypto`,
      Buffer/process globals.
- [x] In-process IPC bus + JS re-implementation of the Electron main process
      (`src/bridge.js`), including default-preferences seeding (fkeys table).
- [x] Native bridge surface (`window.MoebiusNative` ⇄ `webkit.messageHandlers`).
- [x] Decoupled save flow: renderer writes bytes → native presents the document
      picker / share sheet (works around the async-file-dialog mismatch).
- [x] Touch input layer: on-screen control bar, CP437 glyph palette, soft-keyboard
      capture, two-finger pan + pinch-zoom, secondary (right-button) draw.
- [x] Native iOS shell scaffold: `WKWebView` host, message handler, alert/confirm
      panels, document open/save, keyboard avoidance, ⌘-shortcuts, file-type
      registration, XcodeGen project.
- [x] Headless verification: boot/render smoke test + type/F-key/save functional
      test with screenshot.

## Next up

### Verify on device / simulator
- [ ] Generate the project on a Mac, run on the iOS Simulator and a device.
- [ ] Confirm bundled-font `fetch()` works under `file://` in WKWebView (it does
      in Safari; validate the `allowingReadAccessTo` scope covers `fonts/`).
- [ ] Tune control-bar sizing for iPhone (compact) vs iPad (regular) size classes.

### Input & touch
- [ ] Visible cursor affordance in touch mode (the editing cursor can be hard to
      see on a phone) and a "tap to place cursor" hint.
- [ ] Selection handles for marquee select / move (currently relies on the
      keyboard's shift+arrow selection path).
- [ ] Reposition the on-screen bar above the soft keyboard using the
      `visualViewport` API (belt-and-braces with native keyboard avoidance).
- [ ] Long-press as an alternative to the **2nd** toggle for one-off right-clicks.
- [ ] Apple Pencil pressure / palm rejection tuning.
- [ ] Map remaining desktop shortcuts (insert/overwrite, brush size, character-set
      cycling) onto the control bar / a secondary panel.

### Native chrome & parity
- [ ] Rebuild Moebius's menu (`app/menu.js`, ~37 KB of commands) as a native iOS
      menu (`UIMenu`/key commands) driving the existing renderer IPC channels.
- [ ] Multi-button save prompt as a native action sheet (currently collapses onto
      confirm/alert — see `shims/electron-remote.js`).
- [ ] Preferences screen (nick/group, iCE colours, fonts) → push via `set_prefs`.
- [ ] Modal windows that desktop Moebius opens as separate `BrowserWindow`s
      (resize, SAUCE info, new-connection, fkey editor) → native sheets or
      in-page modals.
- [ ] Multi-document support via multiple `UIScene`s (iPad).
- [ ] In-place save (write back to the security-scoped URL) in addition to export.
- [ ] Reference image import, guides, drawing grid toggles.

### Networking (joint editing)
- [ ] Validate `doc.connect_to_server` over native `WebSocket` from WKWebView.
- [ ] New-connection UI + saved servers.
- [ ] Chat panel touch layout.

### Polish
- [ ] App icon + launch screen.
- [ ] Hourly backup using app sandbox storage (re-enable `use_backup`).
- [ ] Files app integration / open-in-place round-trip testing.
- [ ] Automated CI for the web build + headless tests.

## Known limitations / notes

- `process.platform` is reported as `"ios"` (not `"darwin"`), so the renderer
  takes the non-mac code paths (e.g. Ctrl+Z/Y undo/redo). ⌘-equivalents are
  provided natively. Insert/overwrite toggle (mac-only in the renderer) needs the
  native menu route.
- The hourly auto-saver's `crypto`/`fs.readFileSync` usage is stubbed; the feature
  is off by default and should be reimplemented against app sandbox storage.
- Synchronous Electron dialogs are mapped onto the WebView's synchronous
  confirm/alert panels; richer multi-choice prompts await native action sheets.
