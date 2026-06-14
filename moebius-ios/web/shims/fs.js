// fs.js — minimal in-memory filesystem standing in for Node's `fs`.
//
// The Moebius renderer reads and writes a handful of files by path. On iOS we
// can't (and shouldn't) expose a real path-based filesystem to the WebView, so
// we model files as an in-memory map keyed by a "virtual path":
//
//   * Opening a document: the Swift shell reads the picked file and calls
//     `seed_file(path, bytes)` before telling the renderer to `open_file` that
//     path. `fs.readFile` then resolves from memory.
//
//   * Saving a document: the renderer calls `fs.writeFileSync(path, bytes)`. We
//     stash the bytes and forward them to Swift (`save_file`), which presents the
//     document-picker / share sheet. Picking a destination is thus decoupled from
//     the renderer's synchronous save logic — see shims/electron-remote.js.
//
// Only the two entry points Moebius actually uses (readFile, writeFileSync) are
// implemented; everything else throws so missing usage is caught early.

const ipc = require("./ipc");

const vfs = new Map(); // virtual path -> Uint8Array

function to_uint8(data, encoding) {
    if (data == null) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data; // covers Buffer too
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof data === "string") {
        if (encoding === "base64") return base64_to_uint8(data);
        if (encoding === "utf8" || encoding === "utf-8") return new TextEncoder().encode(data);
        // "binary"/"latin1" (and the default for Moebius's byte strings)
        const out = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
        return out;
    }
    throw new TypeError("fs shim: unsupported data type for write");
}

function uint8_to_base64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64_to_uint8(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

// Buffer.from(uint8) gives the renderer the Buffer methods it expects on read.
function as_buffer(bytes) {
    return (typeof Buffer !== "undefined") ? Buffer.from(bytes) : bytes;
}

// ---- Public Node-style API ----

function readFile(path, options, callback) {
    if (typeof options === "function") { callback = options; }
    const bytes = vfs.get(path);
    if (bytes) {
        Promise.resolve().then(() => callback(null, as_buffer(bytes)));
    } else {
        const err = new Error(`ENOENT: no such file in virtual fs, open '${path}'`);
        err.code = "ENOENT";
        Promise.resolve().then(() => callback(err));
    }
}

function writeFileSync(path, data, encoding) {
    const bytes = to_uint8(data, encoding);
    vfs.set(path, bytes);
    ipc.native_post("save_file", { path, base64: uint8_to_base64(bytes) });
}

function existsSync(path) {
    return vfs.has(path);
}

// ---- Bridge helpers (called from src/bridge.js) ----

// Place bytes into the virtual fs so a subsequent readFile resolves them.
function seed_file(path, bytes) {
    vfs.set(path, bytes instanceof Uint8Array ? bytes : base64_to_uint8(bytes));
}

module.exports = {
    readFile,
    writeFileSync,
    existsSync,
    seed_file,
    _vfs: vfs,
    _base64_to_uint8: base64_to_uint8,
    _uint8_to_base64: uint8_to_base64,
};
