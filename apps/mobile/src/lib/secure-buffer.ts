import { gcm } from '@noble/ciphers/aes';
import { expoCrypto } from './optional-native';

/**
 * WHAT A MEMBER'S PHONE HOLDS OUTSIDE THE ENCRYPTED DATABASE — ENCRYPTED TOO.
 *
 * Route points from a dead zone, kept GPS check-ins, queued work-log notes, the
 * remembered home cards and the day's planned route live in AsyncStorage, not
 * in the offline engine's SQLite: the route tracker and the heartbeat run as
 * HEADLESS tasks, and a second connection to that database is exactly what
 * once killed the offline engine. AsyncStorage is plain files (iOS) / a plain
 * SQLite table (Android), and Android includes it in Google Drive backup — so
 * every value is now sealed here first.
 *
 *   value on disk = `enc1:` + base64( nonce(12) ‖ AES-256-GCM(value) ‖ tag(16) )
 *
 * ⚠️ ONE RANDOM KEY PER MEMBER, in SecureStore with AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY:
 * readable by a background task while the phone is locked (after the first
 * unlock since boot), never synced to iCloud and never in a backup. A backed-up
 * or copied AsyncStorage is ciphertext without its key.
 *
 * ⚠️ THE STORAGE KEY AND THE OWNER ARE AUTHENTICATED (GCM associated data).
 * A value moved to another key, read for another member, or altered by one
 * bit fails to open — and failing to open is `null`, never a throw: the
 * headless task reading it has nobody to report to.
 *
 * ⚠️ `forgetSecure(owner)` DELETES THE KEY. Everything sealed with it becomes
 * noise at once, wherever copies of it went (a crypto-shred) — called by
 * endSession when the member's local data is destroyed.
 *
 * ⚠️ PLAINTEXT LEFT BY AN OLDER VERSION IS ADOPTED, NOT REFUSED. The adapter
 * (`secureStorage`) sweeps a store's keys once per process and member and
 * re-seals any plaintext in place, and a plaintext value read before that is
 * still returned. Refusing plaintext after a "migrated" mark would lose the
 * points an OTA ROLLBACK wrote with the old bundle; and whoever can write this
 * app's storage can already do far worse than plant a route point.
 */

export const ENVELOPE = 'enc1:';
const KEY_PREFIX = 'hbc_sb_key_';
/** A key that could not be read is not asked for again for this long — one operation fails whole, not half. */
const RETRY_AFTER_MS = 2_000;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export interface PlainStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiRemove?(keys: string[]): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
}

export interface KeyVault {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface SecureBufferDeps {
  storage: PlainStorage;
  /** The key store; null where none is available — nothing can then be sealed or opened. */
  vault(): KeyVault | null;
  randomBytes(n: number): Uint8Array;
  now?: () => number;
}

/** Thrown inside the module (and by `write`) when the member's key cannot be had right now. */
export class KeyUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('secure-buffer: key unavailable');
    (this as { cause?: unknown }).cause = cause;
  }
}

export function createSecureBuffer(deps: SecureBufferDeps) {
  const now = deps.now ?? (() => Date.now());
  const keys = new Map<string, Uint8Array>();
  const loading = new Map<string, Promise<Uint8Array | null>>();
  const failedUntil = new Map<string, number>();
  const swept = new Map<string, Promise<void>>();

  const vaultName = (owner: string) => `${KEY_PREFIX}${owner.replace(/[^A-Za-z0-9._-]/g, '_')}`;

  function loadKey(owner: string, create: boolean): Promise<Uint8Array | null> {
    const cached = keys.get(owner);
    if (cached) return Promise.resolve(cached);
    if ((failedUntil.get(owner) ?? 0) > now()) return Promise.reject(new KeyUnavailableError());
    const slot = `${owner}\u0000${create ? 1 : 0}`;
    const inflight = loading.get(slot);
    if (inflight) return inflight;
    const p = (async () => {
      const vault = deps.vault();
      if (!vault) throw new KeyUnavailableError();
      let raw: string | null;
      try {
        raw = await vault.get(vaultName(owner));
      } catch (err) {
        // ⚠️ A READ ERROR IS NOT "NO KEY": making a new one here would orphan everything sealed with the old.
        failedUntil.set(owner, now() + RETRY_AFTER_MS);
        throw new KeyUnavailableError(err);
      }
      const existing = raw ? fromBase64(raw) : null;
      if (existing && existing.length === KEY_BYTES) {
        keys.set(owner, existing);
        return existing;
      }
      if (!create) return null;
      const fresh = deps.randomBytes(KEY_BYTES);
      if (fresh.length !== KEY_BYTES) throw new KeyUnavailableError();
      try {
        await vault.set(vaultName(owner), toBase64(fresh));
      } catch (err) {
        failedUntil.set(owner, now() + RETRY_AFTER_MS);
        throw new KeyUnavailableError(err);
      }
      keys.set(owner, fresh);
      return fresh;
    })().finally(() => loading.delete(slot));
    loading.set(slot, p);
    return p;
  }

  const aadFor = (key: string, owner: string) => utf8Encode(`${owner}\u0000${key}`);

  function seal(k: Uint8Array, key: string, owner: string, value: string): string {
    const nonce = deps.randomBytes(NONCE_BYTES);
    const sealed = gcm(k, nonce, aadFor(key, owner)).encrypt(utf8Encode(value));
    const out = new Uint8Array(NONCE_BYTES + sealed.length);
    out.set(nonce, 0);
    out.set(sealed, NONCE_BYTES);
    return ENVELOPE + toBase64(out);
  }

  function open(k: Uint8Array, key: string, owner: string, stored: string): string | null {
    try {
      const bytes = fromBase64(stored.slice(ENVELOPE.length));
      if (!bytes || bytes.length < NONCE_BYTES + 16) return null;
      const plain = gcm(k, bytes.subarray(0, NONCE_BYTES), aadFor(key, owner)).decrypt(bytes.subarray(NONCE_BYTES));
      return utf8Decode(plain);
    } catch {
      return null;
    }
  }

  /** Seal and store. Throws when the key cannot be had — never stores plaintext instead. */
  async function write(key: string, value: string, owner: string): Promise<void> {
    const k = await loadKey(owner, true);
    if (!k) throw new KeyUnavailableError();
    await deps.storage.setItem(key, seal(k, key, owner, value));
  }

  /**
   * The value, or null: missing, not sealed, sealed for somebody else or under
   * another key, altered, or no key to open it with. Never throws.
   */
  async function read(key: string, owner: string): Promise<string | null> {
    try {
      const stored = await deps.storage.getItem(key);
      if (!stored || !stored.startsWith(ENVELOPE)) return null;
      const k = await loadKey(owner, false);
      return k ? open(k, key, owner, stored) : null;
    } catch {
      return null;
    }
  }

  /** Delete the member's key: everything sealed with it is unreadable from now on. True when it is gone. */
  async function forget(owner: string): Promise<boolean> {
    keys.delete(owner);
    failedUntil.delete(owner);
    for (const slot of [...swept.keys()]) if (slot.startsWith(`${owner}\u0000`)) swept.delete(slot);
    const vault = deps.vault();
    if (!vault) return false;
    try {
      await vault.remove(vaultName(owner));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Re-seal, in place, every plaintext value a store left before encryption.
   * Once per process per member and store; a failure is retried on the next use.
   * Each value is read, sealed, and written back over itself — nothing is
   * copied, so a value can neither be lost nor doubled.
   */
  function sweep(owner: string, store: string, select: (all: readonly string[]) => string[]): Promise<void> {
    const slot = `${owner}\u0000${store}`;
    let p = swept.get(slot);
    if (!p) {
      p = (async () => {
        const all = (await deps.storage.getAllKeys?.()) ?? [];
        for (const key of select(all)) {
          const raw = await deps.storage.getItem(key);
          if (raw !== null && !raw.startsWith(ENVELOPE)) await write(key, raw, owner);
        }
      })();
      p.catch(() => swept.delete(slot));
      swept.set(slot, p);
    }
    return p;
  }

  /**
   * A key-value store for ONE member, sealed — what the buffers are built on.
   *
   * `getItem` returns the opened value, a plaintext value from before (being
   * re-sealed by the sweep), or null for a value that does not open. It
   * REJECTS when the key cannot be had right now, so a buffer never mistakes
   * "cannot read yet" for "empty" and writes over what it holds.
   */
  function storageFor(owner: string, store: string, select: (all: readonly string[]) => string[]): PlainStorage {
    const ready = () => sweep(owner, store, select).catch(() => undefined);
    return {
      async getItem(key) {
        await ready();
        const stored = await deps.storage.getItem(key);
        if (stored === null) return null;
        if (!stored.startsWith(ENVELOPE)) return stored;
        const k = await loadKey(owner, false);
        return k ? open(k, key, owner, stored) : null;
      },
      async setItem(key, value) {
        // After the sweep: it must never write an older plaintext back over this.
        await ready();
        await write(key, value, owner);
      },
      removeItem: (key) => deps.storage.removeItem(key),
      async multiRemove(list) {
        if (deps.storage.multiRemove) await deps.storage.multiRemove(list);
        else for (const k of list) await deps.storage.removeItem(k);
      },
      getAllKeys: () => deps.storage.getAllKeys?.() ?? Promise.resolve([]),
    };
  }

  return { write, read, forget, sweep, storageFor };
}

export type SecureBuffer = ReturnType<typeof createSecureBuffer>;

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

/* ───────────────────────── the phone's instance ───────────────────────── */

type SecureStoreLib = typeof import('expo-secure-store');
let secureStoreLib: SecureStoreLib | null | undefined;

/*
  expo-secure-store is in every store build; it is required lazily only so the
  plain-TypeScript rule tests that import a buffer do not need a native mock.
*/
function secureStore(): SecureStoreLib | null {
  if (secureStoreLib === undefined) {
    try {
      secureStoreLib = require('expo-secure-store') as SecureStoreLib;
    } catch {
      secureStoreLib = null;
    }
  }
  return secureStoreLib;
}

function phoneVault(): KeyVault | null {
  const lib = secureStore();
  if (!lib) return null;
  // The SAME accessibility on every call: readable by the headless tasks while locked, never off the device.
  const opts = { keychainAccessible: lib.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  return {
    get: (name) => lib.getItemAsync(name, opts),
    set: (name, value) => lib.setItemAsync(name, value, opts),
    remove: (name) => lib.deleteItemAsync(name, opts),
  };
}

function phoneRandomBytes(n: number): Uint8Array {
  const native = expoCrypto();
  if (native) return native.getRandomBytes(n);
  const web = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (web?.getRandomValues) return web.getRandomValues(new Uint8Array(n));
  // No secure randomness, no sealing: a write fails rather than store a guessable key or nonce.
  throw new KeyUnavailableError();
}

let phone: SecureBuffer | null = null;
function phoneBuffer(): SecureBuffer {
  if (!phone) {
    const AsyncStorage = (require('@react-native-async-storage/async-storage') as { default: PlainStorage }).default;
    phone = createSecureBuffer({ storage: AsyncStorage, vault: phoneVault, randomBytes: phoneRandomBytes });
  }
  return phone;
}

/** Seal `value` under `key` for `owner`. Throws when it cannot be sealed — plaintext is never written instead. */
export const writeSecure = (key: string, value: string, owner: string) => phoneBuffer().write(key, value, owner);
/** The value, or null (missing / not sealed / wrong owner / altered / no key). Never throws. */
export const readSecure = (key: string, owner: string) => phoneBuffer().read(key, owner);
/** Crypto-shred: delete the member's key. */
export const forgetSecure = (owner: string) => phoneBuffer().forget(owner);
/** A sealed key-value store for one member; `select` names the store's keys for the one-time re-seal of plaintext. */
export const secureStorage = (owner: string, store: string, select: (all: readonly string[]) => string[]) =>
  phoneBuffer().storageFor(owner, store, select);
/** Re-seal, now, any plaintext a store left for `owner` (what a sealed store's first use does anyway). Rejects when it cannot. */
export const sealPlaintext = (owner: string, store: string, select: (all: readonly string[]) => string[]) =>
  phoneBuffer().sweep(owner, store, select);
