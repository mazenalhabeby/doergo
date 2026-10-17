/** The encrypted buffer itself: its envelope, its key, reading and writing (moved here unchanged) */
import { gcm } from '@noble/ciphers/aes';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from './encoding';

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
