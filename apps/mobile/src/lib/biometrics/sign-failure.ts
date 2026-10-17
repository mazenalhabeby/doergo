import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { expoCrypto } from '../optional-native';
import * as Device from 'expo-device';
import { ApiError } from '../api/client';
import { BiometricError, type KeyOwner } from './types';
import { deviceKeyModule } from './native';

export const KEY_ALIAS = 'hbcfield_device_key';

/** Not a secret — it only names which public key the server should check. */
export const DEVICE_ID_KEY = 'hbcfield_device_id';

/*
  ⚠️ WHO the key belongs to, and WHAT to call them.

  A key is bound to a PHONE; an account is not. Without this, enrolling as one
  member and then signing in as another left the switch reading "on" for the
  second member — and unlocking replayed the FIRST member's key, so they were
  signed in as somebody else entirely. The crypto was correct throughout; the
  binding was simply missing a user.

  The label is stored so the unlock screen can say WHOSE account a fingerprint
  will open. A face cannot tell you that, so the screen has to.
*/
export const OWNER_KEY = 'hbcfield_device_key_owner';

export type SignFailure = { code?: string; message?: string };

/*
  ⚠️ WHAT A FAILED PROMPT MEANS, DECIDED BY ERROR CODE — NEVER BY WORDING.

  This used to read the MESSAGE: "cancel" in it meant cancelled, and anything
  else meant the key was broken and was deleted. That held on Android and was
  wrong on iOS, where the library reports a Face ID cancel raised inside
  `SecKeyCreateSignature` as SIGNATURE_CREATION_FAILED, "Failed to create
  digital signature". Dismissing Face ID once would have erased the member's
  binding, and so would a lockout or a face not recognised in poor light.

  The two platforms do not even agree on the cancel code — iOS USER_CANCEL,
  Android USER_CANCELED — so both are listed.

  Deleting is the one outcome that cannot be undone from the phone, so it
  needs positive evidence. When in doubt the key stays; the worst case is a
  "Tap to try again" and a password, and a revoked key is still caught by the
  server refusing the signature.
*/
export const CANCEL_CODES = new Set([
  'USER_CANCEL', 'USER_CANCELED', 'SYSTEM_CANCEL', 'SYSTEM_CANCELED', 'USER_FALLBACK',
]);

export const INVALIDATED_CODES = new Set([
  // iOS: the key was minted .biometryCurrentSet and the enrolled faces/fingers changed.
  'BIOMETRY_CURRENT_SET_CHANGED',
  // Both: the OS dropped the key.
  'KEY_NOT_FOUND',
]);

export function classifySignFailure(f: SignFailure | null): 'cancelled' | 'invalidated' | 'failed' {
  const code = f?.code?.toUpperCase();
  if (code && CANCEL_CODES.has(code)) return 'cancelled';
  if (code && INVALIDATED_CODES.has(code)) return 'invalidated';
  // Android surfaces KeyPermanentlyInvalidatedException inside a generic
  // SIGNATURE_CREATION_FAILED; its message is the only place it is named.
  if (/permanently\s*invalidated/i.test(f?.message ?? '')) return 'invalidated';
  // No code at all (a thrown JS error): a cancel is still recognisable by name.
  if (!code && /cancel/i.test(f?.message ?? '')) return 'cancelled';
  return 'failed';
}

/** The native key store, or a refusal a caller already knows how to handle. */
export function keys() {
  const lib = deviceKeyModule();
  if (!lib) throw new BiometricError('not-enrolled', 'Biometric key module not in this build');
  return lib;
}

export async function getKeyOwner(): Promise<KeyOwner | null> {
  try {
    const raw = await SecureStore.getItemAsync(OWNER_KEY);
    return raw ? (JSON.parse(raw) as KeyOwner) : null;
  } catch {
    return null;
  }
}

export async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  // Only reached once the key library answered, and every build with it carries expo-crypto too.
  const Crypto = expoCrypto();
  if (!Crypto) throw new Error('expo-crypto is not in this build');
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return id;
}

/** What the member will see in their Devices list. Theirs to recognise, not ours to parse. */
export function deviceLabel(): string {
  return Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

/** How long one of these requests may take before it counts as no network. */
export const BIOMETRIC_REQUEST_TIMEOUT_MS = 15_000;

/*
  ⚠️ THESE HAD NO TIMEOUT. A request into a dead zone waited for the OS to give
  up — minutes, with the fingerprint screen spinning — and every failure,
  including "no network", ended the same way as a refusal.

  Every one goes through the API client now, with the same rules each time:
  one try (a retried challenge is a second nonce), the 15 s budget, and no
  refresh on a 401 — a 401 HERE is a verdict about this phone's key, not about
  the session.
*/
export const ONE_TRY = { retry: false, timeoutMs: BIOMETRIC_REQUEST_TIMEOUT_MS, refreshOn401: false } as const;

/**
 * The server's verdict, or `'unreachable'` for anything that never reached a
 * decision (no network, a timeout, DNS, an answer that could not be read).
 */
export function verdictOf(err: unknown): { status: number } | 'unreachable' {
  return err instanceof ApiError && err.kind === 'http' ? { status: err.status } : 'unreachable';
}

/**
 * Did the SERVER say this phone's key is no longer good?
 *
 * ⚠️ Only 401, 403 and 404 — revoked from another device, the account's
 * password changed, the key unknown. Every other failure (a 429 at shift
 * change, a 502 during a deploy) used to delete the binding too, so a server
 * blip silently switched Face ID off and the member had to find Settings and
 * enrol again. Those are now a "try again", and the key stays.
 */
export function serverRevokedKey(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}
