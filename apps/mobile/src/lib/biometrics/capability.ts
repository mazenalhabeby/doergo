import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import i18n from '../../i18n';

/**
 * What can THIS phone actually do — asked once, answered for every screen.
 *
 * The obvious API is the wrong one, twice over, and both traps are silent:
 *
 * ⚠️ 1. ENROLMENT IS NOT ENOUGH. A keystore-bound key is releasable by Class 3
 * (BIOMETRIC_STRONG) only; Class 2 fails. And Android face unlock is Class 2 on
 * almost everything — Samsung has shipped no Class 3 face since the Galaxy S9,
 * and essentially only recent Pixels qualify. So on a modern Samsung with a
 * face and no fingerprint, `isEnrolledAsync()` says YES and SecureStore then
 * throws ERR_SECURESTORE_AUTH_NOT_CONFIGURED. `getEnrolledLevelAsync()` is the
 * only call that decides anything.
 *
 * ⚠️ 2. `supportedAuthenticationTypesAsync()` UNDER-REPORTS ON ANDROID. A
 * Galaxy Note10+ with both face and fingerprint returns only [FINGERPRINT]
 * (expo#10861). It cannot tell you what the phone has — only what it will admit
 * to. It is used below for the WORD WE PRINT and nothing else, and a missing
 * entry is treated as "unknown", never as "absent".
 *
 * ⚠️ Re-resolve on every foreground. This is not a property of the install: a
 * fingerprint gets added, an OS update lands, a work profile arrives, and the
 * answer changes underneath a running app.
 */

export type Capability =
  /** No sensor, or an MDM policy switched it off. Show nothing at all. */
  | { kind: 'unavailable' }
  /** Hardware is there and unused. Offer a deep link, not a broken switch. */
  | { kind: 'none-enrolled' }
  /** Enrolled, but Class 2 — it can never hold a key. Say why, and what fixes it. */
  | { kind: 'too-weak' }
  /** The only state that may show a prompt. `label` is what the phone calls it. */
  | { kind: 'ready'; label: string };

/** Can this capability be used to protect a credential? One question, one place. */
export function isReady(c: Capability): c is Extract<Capability, { kind: 'ready' }> {
  return c.kind === 'ready';
}

/**
 * Is the switch worth showing at all?
 *
 * `unavailable` is hidden rather than disabled: a control that can never work
 * on this hardware is not a setting, it is a dead end with a label.
 */
export function isOfferable(c: Capability): boolean {
  return c.kind !== 'unavailable';
}

export async function resolveCapability(): Promise<Capability> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return { kind: 'unavailable' };
    if (!(await LocalAuthentication.isEnrolledAsync())) return { kind: 'none-enrolled' };

    // ⚠️ THE gate. See note 1 above — everything else is presentation.
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level !== LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) return { kind: 'too-weak' };

    return { kind: 'ready', label: await resolveLabel() };
  } catch {
    /*
      Swallowed deliberately. Every caller is deciding whether to OFFER
      something optional, and an unreadable capability is indistinguishable
      from an absent one. A toast about a keystore on the login screen helps
      nobody.
    */
    return { kind: 'unavailable' };
  }
}

/**
 * What the phone calls it — the only use of `supportedAuthenticationTypes`.
 *
 * ⚠️ Never print "Face ID" on Android. It is Apple's trademark, it is not what
 * the phone calls it, and it is the fastest way to look like a port. Android
 * says fingerprint, face unlock, or — when the list under-reports and we
 * genuinely cannot tell — the neutral "biometric unlock", which is honest.
 */
async function resolveLabel(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const print = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

  // iOS is truthful here, and a device has exactly one of the two.
  if (Platform.OS === 'ios') {
    return face ? i18n.t('biometrics.faceId') : i18n.t('biometrics.touchId');
  }

  if (face && print) return i18n.t('biometrics.faceOrFingerprint'); // Pixel 8+
  if (print) return i18n.t('biometrics.fingerprint');
  if (face) return i18n.t('biometrics.faceUnlock'); // Class 3 face: Pixels
  return i18n.t('biometrics.generic');
}

/**
 * Where to send somebody who has to fix this in Settings.
 *
 * Android has a dedicated biometric-enrolment screen; iOS has no deep link to
 * Face ID specifically, so the app's own settings page is the closest honest
 * destination. Returning the URL rather than opening it keeps this module free
 * of navigation — the screen decides when to leave.
 */
export function enrolmentSettingsUrl(): string {
  return Platform.OS === 'android' ? 'android.settings.BIOMETRIC_ENROLL' : 'app-settings:';
}
