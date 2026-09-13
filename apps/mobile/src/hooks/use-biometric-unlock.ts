import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/auth-context';
import {
  resolveCapability,
  isReady,
  enrolmentSettingsUrl,
  biometricCredential,
  confirmWithBiometrics,
  BiometricError,
  getKeyOwner,
  type Capability,
  type BiometricFailure,
} from '../lib/biometrics';

/**
 * The whole biometric flow, in one place.
 *
 * ⚠️ DRY, and not optional here. There are three surfaces — the unlock screen,
 * the offer after a password sign-in, and the switch in Account — and every one
 * of them needs the same four things: the capability, whether this phone is
 * bound, how to prompt, and what to say when it fails. Three copies of that is
 * three chances to show a switch the hardware cannot honour, which is exactly
 * the failure this feature is judged on.
 *
 * The hook owns state and effects; the decisions live in `lib/biometrics`, which
 * stays free of React and is the part worth testing.
 */

export interface BiometricUnlock {
  /** What this phone can do. `null` until the first resolve finishes. */
  capability: Capability | null;
  /** Is this phone bound to an account right now? */
  enrolled: boolean;
  /** True while a prompt is up — disable the button, do not unmount it. */
  busy: boolean;
  /** The last failure worth showing. Cleared by the next attempt. */
  failure: BiometricFailure | null;
  /** Ready AND bound — the only condition under which to auto-prompt. */
  canUnlock: boolean;
  /** What the phone calls it: "Face ID", "Fingerprint", "Biometric unlock"… */
  label: string;
  unlock: () => Promise<boolean>;
  enroll: () => Promise<boolean>;
  disable: () => Promise<void>;
  /** Send them to the OS screen that fixes `none-enrolled` or `too-weak`. */
  openSettings: () => void;
  /** Whose account a fingerprint will open. A face cannot say; the screen must. */
  owner: { userId: string; name: string; email: string } | null;
}

export function useBiometricUnlock(): BiometricUnlock {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [capability, setCapability] = useState<Capability | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BiometricFailure | null>(null);
  const [owner, setOwner] = useState<BiometricUnlock['owner']>(null);

  /*
    ⚠️ Re-resolve on every foreground, not once on mount.

    Capability is not a property of the install. Somebody sent to Settings by
    `too-weak` comes back with a fingerprint enrolled, and the switch has to be
    live when they do — otherwise the fix we just recommended appears not to
    work. The same effect catches an OS upgrade that killed the key.
  */
  const refresh = useCallback(async () => {
    /*
      ⚠️ Scoped to the SIGNED-IN member when there is one.

      Signed in, "enrolled" must mean "enrolled by YOU" — otherwise a second
      member sees a switch already on, holding somebody else's key. Signed out,
      the login screen legitimately wants the looser question, because it does
      not yet know who is arriving.
    */
    const [cap, bound, who] = await Promise.all([
      resolveCapability(),
      biometricCredential.isEnrolled(user?.id),
      getKeyOwner(),
    ]);
    setCapability(cap);
    setEnrolled(bound);
    setOwner(who);
  }, [user?.id]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && mounted.current) void refresh();
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [refresh]);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setFailure(null);
    try {
      await biometricCredential.unlock();
      return true;
    } catch (err) {
      const f = err instanceof BiometricError ? err.failure : 'invalidated';
      /*
        A cancel is a decision, not a fault. Surfacing it puts an error on the
        screen every time somebody dismisses the prompt to type their password
        instead — which teaches people the feature is broken.
      */
      setFailure(f === 'cancelled' ? null : f);
      if (f === 'invalidated' || f === 'rejected' || f === 'not-enrolled') setEnrolled(false);
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const enroll = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setBusy(true);
    setFailure(null);
    try {
      /*
        ⚠️ Prove it is them BEFORE binding.

        Creating a keystore key does not prompt on its own, so without this a
        toggle was two taps that handed a 30-day session to whatever finger the
        phone happens to trust — enable-able by anyone holding an unlocked
        phone, which is the exact person this feature is meant to stop.
      */
      if (!(await confirmWithBiometrics(t('biometrics.confirmEnable')))) return false;

      await biometricCredential.enroll({
        userId: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        email: user.email,
      });
      setEnrolled(true);
      await refresh();
      return true;
    } catch {
      setEnrolled(false);
      return false;
    } finally {
      setBusy(false);
    }
  }, [user, t, refresh]);

  const disable = useCallback(async () => {
    await biometricCredential.forget();
    setEnrolled(false);
    setOwner(null);
    setFailure(null);
  }, []);

  const openSettings = useCallback(() => {
    void Linking.openURL(enrolmentSettingsUrl()).catch(() => {});
  }, []);

  return {
    capability,
    enrolled,
    busy,
    failure,
    canUnlock: !!capability && isReady(capability) && enrolled,
    // A sensible word before the first resolve lands, so nothing renders blank.
    label: capability && isReady(capability) ? capability.label : t('biometrics.generic'),
    unlock,
    enroll,
    disable,
    openSettings,
    owner,
  };
}
