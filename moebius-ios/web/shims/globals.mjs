// globals.js — injected at the top of the bundle (esbuild `inject`).
//
// The vendored Moebius renderer assumes a few Node globals exist. We provide
// browser-safe versions: Buffer (used for binary parsing in libtextmode) and a
// minimal process object (platform checks, nextTick).

import { Buffer as _Buffer } from "buffer";

if (typeof globalThis.global === "undefined") globalThis.global = globalThis;
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = _Buffer;
if (typeof globalThis.process === "undefined") {
    globalThis.process = {
        platform: "ios",
        env: {},
        argv: [],
        version: "",
        versions: { node: "" },
        nextTick: (fn, ...args) => Promise.resolve().then(() => fn(...args)),
        cwd: () => "/",
    };
}

export const Buffer = _Buffer;
