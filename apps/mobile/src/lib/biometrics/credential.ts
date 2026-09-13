import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import i18n from '../../i18n';
import { API_URL, getRefreshToken, saveTokens } from '../api/client';
import { DeviceKeyCredential, type KeyOwner as DeviceKeyOwner } from './device-key-credential';

/**
 * The thing biometrics protect — behind an interface, on purpose.
 *
 * Every screen depends on THIS, never on how the secret is held. That is the
 * whole point: the planned device-bound keypair (a private key generated inside
 * the Secure Enclave / StrongBox, signing a server challenge) is a second
 * implementation of these four methods and replaces the one below without a
 * screen changing a line. See the plan — §06 and §07.
 *
 * ⚠️ It is NOT a gate. A gate calls `authenticateAsync()`, gets a boolean and
 * trusts its own answer — patchable in a decompiled bundle, and Apple's
 * reviewers now push back on it. Here the OS will not release the secret at all
 * until a Class 3 biometric passes, so there is nothing for a patched build to
 * skip.
 */
export interface KeyOwner { userId: string; name: string; email: string }

export interface BiometricCredential {
  /** Which implementation — recorded with enrolment so a migration can tell. */
  readonly kind: 'secure-store' | 'device-key';
  /**
   * Is this phone bound — and to WHOM.
   *
   * ⚠️ `forUserId` is not optional decoration. A key belongs to a phone, an
   * account does not: without scoping, enrolling as one member and signing in
   * as another shows the second member a switch that is already "on" and
   * unlocks into the FIRST member's account. Settings must always pass it.
   */
  isEnrolled(forUserId?: string): Promise<boolean>;
  /** Bind this phone to a member. Requires a LIVE session — never from a login form. */
  enroll(owner: KeyOwner): Promise<void>;
  /** Prompt, and produce a session. Throws `BiometricError` on every failure. */
  unlock(): Promise<void>;
  /** Unbind. Must be safe to call when nothing is bound. */
  forget(): Promise<void>;
}

/** Why an unlock failed, in the four shapes a screen actually branches on. */
export type BiometricFailure =
  /** The stored key is gone — enrolment changed, or the OS upgraded. Re-enrol. */
  | 'invalidated'
  /** The member cancelled, or fell back to the password. Say nothing. */
  | 'cancelled'
  /** Nothing was bound on this phone. Show the password form. */
  | 'not-enrolled'
  /** The server refused the credential — revoked, or the token expired. */
  | 'rejected';

export class BiometricError extends Error {
  constructor(readonly failure: BiometricFailure, message?: string) {
    super(message ?? failure);
    this.name = 'BiometricError';
  }
}

/**
 * A SEPARATE keychain item, and that separation is load-bearing.
 *
 * ⚠️ The live tokens must NOT move behind biometrics. `client.ts` stores them
 * AFTER_FIRST_UNLOCK precisely so the background GPS/heartbeat task can read
 * them on a LOCKED phone — a biometric-gated item cannot be read with no user
 * present, by definition, and gating them reintroduces the route gaps and
 * tracker deregistration of Sec audit H12.
 *
 * So this is a second copy, read exactly once per session, only ever with the
 * member looking at the screen. Unlocking mints a fresh pair which is stored
 * the ordinary way, and the tracker never sees a prompt.
 */
const BIO_REFRESH_KEY = 'hbcfield_bio_refresh';

/** iOS prompts on read; Android prompts on every operation. Same words for both. */
function authOpts(): SecureStore.SecureStoreOptions {
  return {
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    authenticationPrompt: i18n.t('biometrics.prompt'),
  };
}

/**
 * The OS refuses a biometric-protected item for two very different reasons, and
 * only one of them is worth interrupting somebody about.
 */
function classify(err: unknown): BiometricFailure {
  const m = String((err as Error)?.message ?? err).toLowerCase();
  if (m.includes('cancel') || m.includes('user_canceled') || m.includes('authentication canceled')) {
    return 'cancelled';
  }
  /*
    Everything else from the keystore means the key is unusable: a fingerprint
    added, a face edited, a passcode removed and re-added (iOS 17+), or a
    Samsung OS upgrade. The item is dead and will never open again — deleting
    it here is what turns a permanent silent failure into one honest re-enrol.
  */
  return 'invalidated';
}

class SecureStoreCredential implements BiometricCredential {
  readonly kind = 'secure-store' as const;

  async isEnrolled(_forUserId?: string): Promise<boolean> {
    try {
      // ⚠️ No `requireAuthentication` here — this is "is something bound", and
      // asking it would prompt on every app launch to render a switch.
      return (await SecureStore.getItemAsync(BIO_REFRESH_KEY)) !== null;
    } catch {
      return false;
    }
  }

  async enroll(_owner: KeyOwner): Promise<void> {
    const refresh = await getRefreshToken();
    if (!refresh) throw new BiometricError('not-enrolled', 'No live session to bind');
    await SecureStore.setItemAsync(BIO_REFRESH_KEY, refresh, authOpts());
  }

  async unlock(): Promise<void> {
    let stored: string | null;
    try {
      stored = await SecureStore.getItemAsync(BIO_REFRESH_KEY, authOpts());
    } catch (err) {
      const failure = classify(err);
      if (failure === 'invalidated') await this.forget();
      throw new BiometricError(failure);
    }
    if (!stored) throw new BiometricError('not-enrolled');

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored }),
    });
    if (!res.ok) {
      // The server has revoked it, or 30 days passed. The stored copy is now
      // worthless, so remove it rather than prompting for it again tomorrow.
      await this.forget();
      throw new BiometricError('rejected');
    }

    const body = await res.json();
    const { accessToken, refreshToken } = body.data ?? body;
    await saveTokens(accessToken, refreshToken);

    /*
      ⚠️ Refresh tokens ROTATE, so the stored copy is spent the moment it is
      used and must be replaced or the next unlock fails.

      ⚠️ On ANDROID this write prompts a second time — SecureStore requires
      authentication for every operation there, while iOS prompts only on read.
      That second prompt is not a bug to work around at this layer; it is the
      cost of holding a ROTATING BEARER SECRET, and it is the concrete reason
      the device-key implementation exists: a signature over a challenge spends
      nothing, so it prompts once on both platforms.
    */
    await SecureStore.setItemAsync(BIO_REFRESH_KEY, refreshToken, authOpts());
  }

  async forget(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(BIO_REFRESH_KEY);
    } catch {
      // Deleting an item whose key is already invalid throws on some Androids.
      // "It is gone" is the outcome either way.
    }
  }
}

/**
 * The one instance the app uses — and the ONE line that chooses how the secret
 * is held. Nothing else in the app knows which implementation is live.
 *
 * ⚠️ `SecureStoreCredential` above is kept as the documented fallback: it needs
 * no server, so it is what a self-hosted deployment without the biometric
 * endpoints would use. The device key is the default because it prompts once
 * instead of twice and leaves nothing on the phone to steal.
 */
export const biometricCredential: BiometricCredential = new DeviceKeyCredential();

/**
 * The plain OS prompt, for RE-authorising an action inside a live session —
 * approving overtime, opening a payslip, signing a document.
 *
 * ⚠️ Correct here and wrong for sign-in. There is no secret to protect at this
 * point: the session already exists, so the boolean is the whole answer and a
 * patched build could only skip a confirmation it already had the right to give.
 */
export async function confirmWithBiometrics(reason: string): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: i18n.t('common.cancel'),
    // Let the device passcode through: a wet finger on a building site must not
    // block an approval, and the passcode already protects everything else here.
    disableDeviceFallback: false,
  });
  return res.success;
}
