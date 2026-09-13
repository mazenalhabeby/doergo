import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import i18n from '../../i18n';
import { API_URL, getRefreshToken, saveTokens } from '../api/client';
import { BiometricError, type BiometricCredential, type BiometricFailure, type KeyOwner } from './types';

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

export class SecureStoreCredential implements BiometricCredential {
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
