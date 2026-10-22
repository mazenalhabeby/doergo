import { useState, useRef, useEffect } from 'react';
import { useRouter, Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useBiometricUnlock } from '@/hooks/use-biometric-unlock';
import { resolveCapability, getKeyOwner } from '@/lib/biometrics';
import { useTheme } from '@/contexts/theme-context';
import { ROUTES } from '@/lib/constants';
import { loadLastUser, shouldAutoPromptFor, type LastUser } from '@/lib/session/last-user';

/** LoginScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useLoginScreen() {
  const router = useRouter();
  const { login, refreshUser, signedOutByUser } = useAuth();
  const bio = useBiometricUnlock();
  const [offerBiometric, setOfferBiometric] = useState(false);
  /** Set when enabling here would take the fingerprint away from another account on this phone. */
  const [offerReplaces, setOfferReplaces] = useState<string | null>(null);
  /*
    Who used this phone last. `undefined` until read, so nothing — not the
    fingerprint card, not the auto-prompt — is decided on a guess.
  */
  const [lastUser, setLastUser] = useState<LastUser | null | undefined>(undefined);
  useEffect(() => {
    void loadLastUser().then(setLastUser);
  }, []);
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  /*
    The member chose the password over the fingerprint. Only meaningful while
    this phone holds a key; without one the form is the only screen there is.
  */
  const [usePassword, setUsePassword] = useState(false);

  const { amazen } = useTheme();
  const c = amazen.color;

  // Animations

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = t('validation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('validation.emailInvalid');
    }

    if (!password) {
      newErrors.password = t('validation.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('validation.passwordMinLength');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /*
    Prompt on open when this phone is bound.

    ⚠️ Once per mount, guarded by a ref. Re-prompting on every render — or on
    every foreground, which the capability refresh triggers — puts the OS sheet
    back up the instant somebody dismisses it to type their password, which
    reads as the app refusing to let them in.
  */
  const unlockAndEnter = async () => {
    if (await bio.unlock()) {
      await refreshUser();
      router.replace(ROUTES.home as Href);
    }
  };

  const promptedRef = useRef(false);
  useEffect(() => {
    /*
      ⚠️ Not straight after an explicit sign-out. Somebody who just tapped
      "Sign out" and is met by a fingerprint sheet is one touch from being
      signed straight back in. The button below stays; only the auto-prompt
      waits for a real launch.
    */
    if (!bio.canUnlock || promptedRef.current || lastUser === undefined) return;
    promptedRef.current = true;
    /*
      ⚠️ Only for the person who used this phone last. The key belongs to
      whoever enrolled it; when a colleague has signed in here since, the OS
      sheet would cover the card that names whose account it opens, and one
      touch put them inside the FIRST person's account. They get the password
      form instead, filled with their own email, and the fingerprint stays one
      clearly labelled tap away.
    */
    if (!shouldAutoPromptFor(bio.owner?.userId, lastUser)) {
      setUsePassword(true);
      if (lastUser?.email) setEmail(lastUser.email);
      return;
    }
    if (signedOutByUser) return;
    void unlockAndEnter();
  }, [bio.canUnlock, signedOutByUser, lastUser, bio.owner?.userId]);

  const handleLogin = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      await login(email.toLowerCase().trim(), password);
      /*
        Offer it once, here, and never again from a banner.

        This is the only moment the member has both a live session to bind and a
        reason to care — and `enroll()` needs that session, so an offer anywhere
        else would have to send them back through this screen anyway. Declined,
        the switch still lives in Account.
      */
      /*
        ⚠️ Resolved FRESH here, not read from hook state.

        The hook resolves asynchronously on mount, and a fast sign-in finishes
        first — so `bio.capability` is still null at this moment on exactly the
        launch where somebody is most likely to be offered this. Reading it gave
        a silent "no" and the offer never appeared.
      */
      const [cap, owner] = await Promise.all([resolveCapability(), getKeyOwner()]);
      /*
        ⚠️ Asked about THIS member, not "is anyone enrolled". `bio.enrolled` is
        resolved signed-out, so it is true for whoever's key is on the phone —
        which meant the member who tapped "Not Mike?" was never offered it.
      */
      const alreadyMine = !!owner && owner.email.toLowerCase() === email.toLowerCase().trim();
      if (cap.kind === 'ready' && !alreadyMine) {
        // One account per phone: say so when this would switch it off for somebody else.
        setOfferReplaces(owner ? owner.name?.trim().split(/\s+/)[0] || owner.email : null);
        setOfferBiometric(true);
      } else {
        router.replace(ROUTES.home as Href);
      }
    } catch (error) {
      // Said under the password, where the eye already is — a toast covered the form it was about.
      const message = error instanceof Error ? error.message : t('auth.login.loginFailed');
      setErrors({ password: message });
    } finally {
      setIsLoading(false);
    }
  };

  /*
    Fingerprint first when this phone holds a key; the form is one tap away.
    ⚠️ Nothing is drawn in the card until the capability has resolved — the
    first frame otherwise shows the form and swaps it for the fingerprint a
    moment later, which reads as the screen changing its mind.
  */
  const resolved = bio.capability !== null && lastUser !== undefined;
  const showBiometric = bio.canUnlock && !usePassword;
  const ownerName = bio.owner?.name?.trim().split(/\s+/)[0] || bio.owner?.email || '';
  const bioNotice =
    bio.failure === 'invalidated' ? t('biometrics.invalidatedBody', { method: bio.label })
      : bio.failure === 'rejected' ? t('biometrics.rejectedBody')
        : bio.failure === 'unreachable' ? t('biometrics.unreachableBody')
          : null;

  const switchToPassword = (sameAccount: boolean) => {
    setUsePassword(true);
    setEmail(sameAccount ? bio.owner?.email ?? '' : '');
    setPassword('');
    setErrors({});
  };

  const goHome = () => { setOfferBiometric(false); router.replace(ROUTES.home as Href); };

  return {
    router,
    bio,
    offerBiometric,
    offerReplaces,
    t,
    email,
    setEmail,
    password,
    setPassword,
    isLoading,
    errors,
    setErrors,
    setUsePassword,
    amazen,
    c,
    unlockAndEnter,
    handleLogin,
    resolved,
    showBiometric,
    ownerName,
    bioNotice,
    switchToPassword,
    goHome,
  };
}
