/**
 * The phone's own buffer: the secure store as the key vault, random bytes, the one instance (moved
 * here unchanged)
 */
import { expoCrypto } from '../optional-native';
import { KeyUnavailableError, createSecureBuffer, type KeyVault, type PlainStorage, type SecureBuffer } from './buffer';

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
