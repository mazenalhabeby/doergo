/** Base64 and UTF-8, natively where the platform has them, in plain JS where not (moved here unchanged) */

/* ───────────────────────── encodings ─────────────────────────
  Hermes has TextEncoder, btoa and atob built in (no TextDecoder), and they are
  5–12× faster than the same work in JavaScript — measured on the Hermes VM
  for a 200-point chunk: base64 1.3 → 0.2 ms, UTF-8 decode 3.6 → 0.3 ms. The
  JavaScript versions below are the fallback and the reference the tests hold
  the fast paths to.
*/
type Globals = {
  TextEncoder?: new () => { encode(s: string): Uint8Array };
  btoa?: (s: string) => string;
  atob?: (s: string) => string;
  escape?: (s: string) => string;
};

const G = globalThis as unknown as Globals;

const textEncoder = typeof G.TextEncoder === 'function' ? new G.TextEncoder() : null;

function binaryString(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 8192) out += String.fromCharCode.apply(null, b.subarray(i, i + 8192) as unknown as number[]);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  if (G.btoa) {
    try { return G.btoa(binaryString(bytes)); } catch { /* fall through */ }
  }
  return toBase64Js(bytes);
}

/** Null for anything that is not strict base64. */
export function fromBase64(s: string): Uint8Array | null {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  if (G.atob) {
    try {
      const bin = G.atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch { /* fall through */ }
  }
  return fromBase64Js(s);
}

export function utf8Encode(s: string): Uint8Array {
  // TextEncoder replaces a lone surrogate with U+FFFD, exactly as the fallback does.
  return textEncoder ? textEncoder.encode(s) : utf8EncodeJs(s);
}

export function utf8Decode(b: Uint8Array): string {
  if (G.escape) {
    // Authenticated bytes are always valid UTF-8; anything else falls back.
    try { return decodeURIComponent(G.escape(binaryString(b))); } catch { /* fall through */ }
  }
  return utf8DecodeJs(b);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function toBase64Js(bytes: Uint8Array): string {
  let out = '';
  let chunk = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    chunk += B64[v >> 18]! + B64[(v >> 12) & 63]! + B64[(v >> 6) & 63]! + B64[v & 63]!;
    if (chunk.length > 4096) { out += chunk; chunk = ''; }
  }
  if (i < n) {
    const v = (bytes[i]! << 16) | ((i + 1 < n ? bytes[i + 1]! : 0) << 8);
    chunk += B64[v >> 18]! + B64[(v >> 12) & 63]! + (i + 1 < n ? B64[(v >> 6) & 63]! : '=') + '=';
  }
  return out + chunk;
}

/** The JavaScript decoder: null for anything that is not strict base64. */
export function fromBase64Js(s: string): Uint8Array | null {
  const n = s.length;
  if (n % 4 !== 0) return null;
  const pad = n > 0 && s.charCodeAt(n - 1) === 61 ? (s.charCodeAt(n - 2) === 61 ? 2 : 1) : 0;
  const out = new Uint8Array((n / 4) * 3 - pad);
  const body = n - pad;
  let o = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (i < body) {
      const code = s.charCodeAt(i);
      v = code < 128 ? B64_INDEX[code]! : -1;
      if (v < 0) return null;
    }
    acc = (acc << 6) | v;
    if ((i & 3) === 3) {
      if (o < out.length) out[o++] = (acc >> 16) & 255;
      if (o < out.length) out[o++] = (acc >> 8) & 255;
      if (o < out.length) out[o++] = acc & 255;
      acc = 0;
    }
  }
  return out;
}

export function utf8EncodeJs(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 3);
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      } else c = 0xfffd;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out[o++] = c;
    else if (c < 0x800) { out[o++] = 0xc0 | (c >> 6); out[o++] = 0x80 | (c & 63); }
    else if (c < 0x10000) { out[o++] = 0xe0 | (c >> 12); out[o++] = 0x80 | ((c >> 6) & 63); out[o++] = 0x80 | (c & 63); }
    else { out[o++] = 0xf0 | (c >> 18); out[o++] = 0x80 | ((c >> 12) & 63); out[o++] = 0x80 | ((c >> 6) & 63); out[o++] = 0x80 | (c & 63); }
  }
  // A surrogate pair is 2 chars → 4 bytes, so 3 bytes per char always fits.
  return out.subarray(0, o);
}

export function utf8DecodeJs(b: Uint8Array): string {
  const parts: string[] = [];
  let codes: number[] = [];
  for (let i = 0; i < b.length; ) {
    const x = b[i]!;
    let c: number;
    if (x < 0x80) { c = x; i += 1; }
    else if (x >= 0xc0 && x < 0xe0 && i + 1 < b.length) { c = ((x & 31) << 6) | (b[i + 1]! & 63); i += 2; }
    else if (x >= 0xe0 && x < 0xf0 && i + 2 < b.length) { c = ((x & 15) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63); i += 3; }
    else if (x >= 0xf0 && i + 3 < b.length) {
      c = ((x & 7) << 18) | ((b[i + 1]! & 63) << 12) | ((b[i + 2]! & 63) << 6) | (b[i + 3]! & 63);
      i += 4;
    } else { c = 0xfffd; i += 1; }
    if (c > 0xffff) { c -= 0x10000; codes.push(0xd800 + (c >> 10), 0xdc00 + (c & 1023)); }
    else codes.push(c);
    if (codes.length > 4096) { parts.push(String.fromCharCode(...codes)); codes = []; }
  }
  parts.push(String.fromCharCode(...codes));
  return parts.join('');
}
