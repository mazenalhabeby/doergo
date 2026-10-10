import { localAuthentication } from '../optional-native';
import i18n from '../../i18n';

/*
  ⚠️ The stored-refresh-token credential (`SecureStoreCredential`) that lived
  here was removed: `getBiometricCredential()` has only ever built the
  device-key one since it replaced it, so the old class was dead code that
  still held a full sign-in path. What remains is the plain re-authorisation
  prompt below.
*/

/**
 * The plain OS prompt, for RE-authorising an action inside a live session —
 * approving overtime, opening a payslip, signing a document.
 *
 * ⚠️ Correct here and wrong for sign-in. There is no secret to protect at this
 * point: the session already exists, so the boolean is the whole answer and a
 * patched build could only skip a confirmation it already had the right to give.
 */
export async function confirmWithBiometrics(reason: string): Promise<boolean> {
  // A build without the prompt cannot confirm anything: refuse rather than wave it through.
  const LocalAuthentication = localAuthentication();
  if (!LocalAuthentication) return false;
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: i18n.t('common.cancel'),
    // Let the device passcode through: a wet finger on a building site must not
    // block an approval, and the passcode already protects everything else here.
    disableDeviceFallback: false,
  });
  return res.success;
}
