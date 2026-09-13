export {
  resolveCapability,
  isReady,
  isOfferable,
  enrolmentSettingsUrl,
  type Capability,
} from './capability';

export {
  BiometricError,
  type BiometricCredential,
  type BiometricFailure,
  type KeyOwner,
} from './types';

export { confirmWithBiometrics, SecureStoreCredential } from './credential';
export { DeviceKeyCredential, getKeyOwner } from './device-key-credential';

import { DeviceKeyCredential } from './device-key-credential';
import type { BiometricCredential } from './types';

/**
 * The ONE line that chooses how the secret is held. Nothing else in the app
 * knows which implementation is live.
 *
 * ⚠️ It lives HERE, in the barrel, and not beside either implementation — that
 * is what previously made `credential.ts` import `device-key-credential.ts`
 * while the reverse was also true, and the resulting cycle froze the app on its
 * splash screen. A chooser must sit above the things it chooses between.
 *
 * ⚠️ Lazy, not `new` at module scope. Constructing during module evaluation is
 * what turned a resolvable cycle into a crash; a getter also means a phone that
 * never touches biometrics never builds the object at all.
 */
let instance: BiometricCredential | null = null;
export function getBiometricCredential(): BiometricCredential {
  if (!instance) instance = new DeviceKeyCredential();
  return instance;
}

/**
 * Convenience for the many call sites that just want the credential. Delegates
 * on each call, so it is still lazy and still one instance.
 */
export const biometricCredential: BiometricCredential = {
  get kind() { return getBiometricCredential().kind; },
  isEnrolled: (u) => getBiometricCredential().isEnrolled(u),
  enroll: (o) => getBiometricCredential().enroll(o),
  unlock: () => getBiometricCredential().unlock(),
  forget: () => getBiometricCredential().forget(),
};
