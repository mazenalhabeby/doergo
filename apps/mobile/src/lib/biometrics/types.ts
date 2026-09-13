/**
 * The contract, on its own — importable by every implementation without any of
 * them importing each other.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE CYCLE FROZE THE APP ON LAUNCH.
 *
 * The interface used to live beside the SecureStore implementation, so
 * `credential.ts` imported `DeviceKeyCredential` to pick a default while
 * `device-key-credential.ts` imported `BiometricError` back. Metro resolved
 * that half-initialised: `DeviceKeyCredential` was still `undefined` when
 * `credential.ts` reached `new DeviceKeyCredential()` at module scope, which
 * threw during module init — before React mounted anything. The splash never
 * went away, and nothing was logged.
 *
 * Types and errors belong here; implementations import this and never one
 * another. `npm run lint:cycles` fails the build if that is ever undone.
 */

/** Who a device key belongs to — a key is bound to a phone, an account is not. */
export interface KeyOwner {
  userId: string;
  name: string;
  email: string;
}

/** Why an unlock failed, in the four shapes a screen actually branches on. */
export type BiometricFailure =
  /** The stored key is gone — enrolment changed, or the OS upgraded. Re-enrol. */
  | 'invalidated'
  /** The member cancelled, or fell back to the password. Say nothing. */
  | 'cancelled'
  /** Nothing was bound on this phone. Show the password form. */
  | 'not-enrolled'
  /** The server refused the credential — revoked, or expired. */
  | 'rejected';

export class BiometricError extends Error {
  constructor(readonly failure: BiometricFailure, message?: string) {
    super(message ?? failure);
    this.name = 'BiometricError';
  }
}

/**
 * The thing biometrics protect.
 *
 * Every screen depends on THIS, never on how the secret is held — which is what
 * let the device-bound keypair replace the stored token without a screen
 * changing a line.
 */
export interface BiometricCredential {
  /** Which implementation — recorded with enrolment so a migration can tell. */
  readonly kind: 'secure-store' | 'device-key';
  /**
   * Is this phone bound — and to WHOM.
   *
   * ⚠️ `forUserId` is not decoration. A key belongs to a phone, an account does
   * not: without scoping, enrolling as one member and signing in as another
   * showed the second a switch already "on", and unlocking opened the FIRST
   * member's account. Settings must always pass it.
   */
  isEnrolled(forUserId?: string): Promise<boolean>;
  /** Bind this phone to a member. Requires a LIVE session — never from a login form. */
  enroll(owner: KeyOwner): Promise<void>;
  /** Prompt, and produce a session. Throws `BiometricError` on every failure. */
  unlock(): Promise<void>;
  /** Unbind. Must be safe to call when nothing is bound. */
  forget(): Promise<void>;
}
