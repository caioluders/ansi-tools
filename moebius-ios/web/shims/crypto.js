// crypto.js — tiny stand-in for the Node `crypto` module.
//
// The only consumer in the bundle is hourly_saver.js, which hashes two files to
// decide whether an automatic backup changed. That feature is off by default on
// iOS, so this code rarely runs; when it does, a fast non-cryptographic content
// hash is perfectly adequate for change detection (it is NOT used for security).

function createHash() {
    let h1 = 0x811c9dc5; // FNV-1a 32-bit
    let h2 = 0x01000193;
    return {
        update(data) {
            const bytes = (typeof data === "string")
                ? new TextEncoder().encode(data)
                : (data instanceof Uint8Array ? data : new Uint8Array(data));
            for (let i = 0; i < bytes.length; i++) {
                h1 ^= bytes[i];
                h1 = Math.imul(h1, 0x01000193) >>> 0;
                h2 = Math.imul(h2 ^ bytes[i], 0x85 + i) >>> 0;
            }
            return this;
        },
        digest() {
            return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
        },
    };
}

module.exports = { createHash };
