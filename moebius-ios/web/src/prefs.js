// prefs.js — default preferences for the iOS port.
//
// In desktop Moebius the Electron main process (app/prefs.js) persists a
// preferences.json and, on window creation, sends every preference to the
// renderer as an individually-named IPC channel (`fkeys`, `default_fkeys`,
// `use_shift`, …). The renderer relies on some of these being present before the
// first render — notably `fkeys`, the F1–F12 character sets, without which the
// toolbar throws.
//
// We mirror that here. The fkeys table is Moebius's built-in default
// ("Stolen mercilously from Pablo, thanks Curtis!"). The native shell can later
// override individual values (e.g. nick/group) via the menu bridge.

const DEFAULT_PREFS = {
    nick: "Anonymous",
    group: "",
    use_flashing_cursor: false,
    use_pixel_aliasing: false,
    use_numpad: false,
    use_shift: true,
    chunked_undo: true,
    hide_scrollbars: false,
    unsaved_changes: true,
    scroll_margin: 0,
    new_document_rows: 25,
    retention: "8035200",
    smallscale_guide: false,
    debug: false,
    ignore_hdpi: false,
    discord: false,
    use_backup: false,
    backup_folder: "",
    fkeys: [
        [218, 191, 192, 217, 196, 179, 195, 180, 193, 194, 32, 32],
        [201, 187, 200, 188, 205, 186, 204, 185, 202, 203, 32, 32],
        [213, 184, 212, 190, 205, 179, 198, 181, 207, 209, 32, 32],
        [214, 183, 211, 189, 196, 186, 199, 182, 208, 210, 32, 32],
        [197, 206, 216, 215, 232, 232, 155, 156, 153, 239, 32, 32],
        [176, 177, 178, 219, 223, 220, 221, 222, 254, 250, 32, 32],
        [1, 2, 3, 4, 5, 6, 240, 14, 15, 32, 32, 32],
        [24, 25, 30, 31, 16, 17, 18, 29, 20, 21, 32, 32],
        [174, 175, 242, 243, 169, 170, 253, 246, 171, 172, 32, 32],
        [227, 241, 244, 245, 234, 157, 228, 248, 251, 252, 32, 32],
        [224, 225, 226, 229, 230, 231, 235, 236, 237, 238, 32, 32],
        [128, 135, 165, 164, 152, 159, 247, 249, 173, 168, 32, 32],
        [131, 132, 133, 160, 166, 134, 142, 143, 145, 146, 32, 32],
        [136, 137, 138, 130, 144, 140, 139, 141, 161, 158, 32, 32],
        [147, 148, 149, 162, 167, 150, 129, 151, 163, 154, 32, 32],
        [47, 92, 40, 41, 123, 125, 91, 93, 96, 39, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
    ],
    default_fkeys: 5,
    server: "",
    pass: "",
    saved_servers: [],
};

module.exports = { DEFAULT_PREFS };
