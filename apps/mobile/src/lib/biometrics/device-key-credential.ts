import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import {
  createKeys,
  deleteKeys,
  keyExists,
  signWithOptions,
  BiometricStrength,
  InputEncoding,
} from '@sbaiahmed1/react-native-biometrics';
import i18n from '../../i18n';
import { API_URL, getAccessToken, saveTokens } from '../api/client';
import { BiometricError, type BiometricCredential } from './credential';

/**
 * Sign-in with nothing to steal.
 *
 * A P-256 private key is generated INSIDE the Secure Enclave (iOS) or
 * StrongBox/TEE (Android) and cannot be exported — not by us, not by a patched
 * build, not by someone imaging the device. Signing in means signing a
 * server-issued nonce with it. There is no bearer secret on the phone at any
 * point, so a stolen device yields a key handle that is useless off that chip,
 * and a lost phone is revoked with one row server-side.
 *
 * ⚠️ Why this replaced the SecureStore implementation: a stored refresh token
 * ROTATES, so it is spent on use and must be rewritten — and Android requires
 * authentication for every SecureStore operation, so each unlock cost TWO
 * prompts. A signature spends nothing. One prompt, both platforms, and strictly
 * better security. Same `BiometricCredential` interface; no screen changed.
 */

const KEY_ALIAS = 'hbcfield_device_key';
/** Not a secret — it only names which public key the server should check. */
const DEVICE_ID_KEY = 'hbcfield_device_id';
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
const OWNER_KEY = 'hbcfield_device_key_owner';

export interface KeyOwner { userId: string; name: string; email: string }

export async function getKeyOwner(): Promise<KeyOwner | null> {
  try {
    const raw = await SecureStore.getItemAsync(OWNER_KEY);
    return raw ? (JSON.parse(raw) as KeyOwner) : null;
  } catch {
    return null;
  }
}

async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return id;
}

/** What the member will see in their Devices list. Theirs to recognise, not ours to parse. */
function deviceLabel(): string {
  return Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

async function post(path: string, body: unknown, bearer?: string): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export class DeviceKeyCredential implements BiometricCredential {
  readonly kind = 'device-key' as const;

  /**
   * @param forUserId When given, "is THIS member enrolled" — which is the only
   * question a settings switch should ever ask. Omitted, it is the looser "is
   * anyone enrolled on this phone", which the login screen needs before it
   * knows who is signing in.
   */
  async isEnrolled(forUserId?: string): Promise<boolean> {
    try {
      const [id, exists, owner] = await Promise.all([
        SecureStore.getItemAsync(DEVICE_ID_KEY),
        keyExists(KEY_ALIAS),
        getKeyOwner(),
      ]);
      // All three, because each can disappear alone: the OS drops the key on an
      // enrolment change while our id survives, and a reinstall clears the id
      // while an Android keystore entry can outlive it.
      if (!id || exists !== true || !owner) return false;
      return forUserId ? owner.userId === forUserId : true;
    } catch {
      return false;
    }
  }

  async enroll(owner: KeyOwner): Promise<void> {
    const access = await getAccessToken();
    // ⚠️ Enrolment MUST ride on a live session. Without it, anyone who reaches
    // the endpoint can bind their own key to somebody else's account.
    if (!access) throw new BiometricError('not-enrolled', 'No live session to bind');

    /*
      ⚠️ Capture `publicKey` HERE and send it now.

      On iOS the Keychain can refuse even a non-interactive lookup of an
      auth-bound key, so reading it back later may simply fail — creation is the
      one moment it is reliably available on both platforms.

      `Strong` is the Class 3 requirement, and `allowDeviceCredentials: false`
      keeps a PIN from standing in for a biometric at BINDING time. The prompt
      at signing time is where a passcode fallback would be considered.
    */
    const { publicKey } = await createKeys(
      KEY_ALIAS,
      'ec256',
      BiometricStrength.Strong,
      false,
      false,
    );

    const id = await deviceId();
    const res = await post(
      '/auth/biometric/enroll',
      { deviceId: id, publicKey, label: deviceLabel(), platform: Platform.OS },
      access,
    );
    if (!res.ok) {
      // Never leave a key on the device the server does not know about — it
      // would prompt, sign, and be rejected forever with nothing to explain it.
      await deleteKeys(KEY_ALIAS).catch(() => {});
      throw new BiometricError('rejected', 'Enrolment refused');
    }

    // Written LAST: the owner record is what every other surface treats as
    // "enrolled", so it must not exist before the server agrees.
    await SecureStore.setItemAsync(OWNER_KEY, JSON.stringify(owner), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }

  async unlock(): Promise<void> {
    const id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) throw new BiometricError('not-enrolled');

    // 1 — a nonce we did not choose. Single-use, short-lived, server-issued:
    // a client-supplied challenge turns one captured signature into a key.
    const chRes = await post('/auth/biometric/challenge', { deviceId: id });
    if (!chRes.ok) throw new BiometricError('rejected');
    const chBody = await chRes.json();
    const challenge: string = (chBody.data ?? chBody).challenge;

    // 2 — the only prompt in the whole flow.
    let signature: string | undefined;
    try {
      const signed = await signWithOptions({
        keyAlias: KEY_ALIAS,
        data: challenge,
        /*
          ⚠️ The nonce is base64 BYTES, and this says so.

          Left as UTF-8 the device would sign the *characters* of the base64
          while the server verifies over the *decoded* bytes — and the only
          symptom is that every signature is rejected, with both sides
          apparently correct. Server and client must agree on what was signed.
        */
        inputEncoding: InputEncoding.Base64,
        promptTitle: i18n.t('biometrics.prompt'),
        cancelButtonText: i18n.t('common.cancel'),
        // Class 3 at signing time too, not only at binding time.
        biometricStrength: BiometricStrength.Strong,
        // A passcode cannot stand in for the biometric that guards the key.
        disableDeviceFallback: true,
      });
      if (!signed.success || !signed.signature) throw new Error(signed.error ?? 'cancelled');
      signature = signed.signature;
    } catch (err) {
      const m = String((err as Error)?.message ?? err).toLowerCase();
      if (m.includes('cancel')) throw new BiometricError('cancelled');
      /*
        Anything else means the key is unusable — a fingerprint added, a face
        edited, a passcode removed and re-added (iOS 17+), a Samsung OS upgrade.
        Clearing it turns a permanent silent failure into one honest re-enrol.
      */
      await this.forget();
      throw new BiometricError('invalidated');
    }

    // 3 — the server checks the signature against the key it holds for this device.
    const vRes = await post('/auth/biometric/verify', { deviceId: id, signature });
    if (!vRes.ok) {
      // Revoked from another device, or the key is unknown. Either way this
      // phone is no longer bound, so stop pretending it is.
      await this.forget();
      throw new BiometricError('rejected');
    }
    const body = await vRes.json();
    const { accessToken, refreshToken } = body.data ?? body;
    await saveTokens(accessToken, refreshToken);
  }

  async forget(): Promise<void> {
    const id = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
    await Promise.allSettled([
      deleteKeys(KEY_ALIAS),
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      SecureStore.deleteItemAsync(OWNER_KEY),
      // Best effort: the local key is already gone, and a server row that
      // outlives it is revoked from the Devices screen or by a password change.
      (async () => {
        const access = await getAccessToken();
        if (id && access) {
          await fetch(`${API_URL}/auth/devices/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${access}` },
          });
        }
      })(),
    ]);
  }
}
