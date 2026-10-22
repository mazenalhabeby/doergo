import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, TextInput } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { joinCodeCandidates, personName } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { invitationsApi, onboardingApi } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import { cleanPassCode, daysLeft, lookUpPassCode, type PassLookup } from '@/lib/pass-code';

export const PAUSE_MS = 700;

export type Look = { state: 'typing' | 'reading' } | { state: 'found'; found: PassLookup } | { state: 'error'; message: string };

/** PassScreen's state and handlers — everything before its markup, moved here unchanged. */
export function usePassScreen({ initialCode }: Pick<{ initialCode?: string }, 'initialCode'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();

  const [code, setCode] = useState(cleanPassCode(initialCode ?? ''));
  const [look, setLook] = useState<Look>({ state: 'typing' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'start' | 'nocode' | null>(null);
  const cache = useRef(new Map<string, PassLookup>());
  const input = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;

  // Ask once the typing pauses, and never twice about the same code: the
  // validate routes are rate-limited, and a person fixing one character
  // should not spend the allowance re-asking about the rest.
  useEffect(() => {
    if (joinCodeCandidates(code, 'INVITATION').length === 0) { setLook({ state: 'typing' }); return; }
    const known = cache.current.get(code);
    if (known) { setLook({ state: 'found', found: known }); return; }
    setLook({ state: 'reading' });
    let live = true;
    const timer = setTimeout(() => {
      lookUpPassCode(code, { invitation: invitationsApi.validate, org: onboardingApi.validateOrgCode })
        .then((found) => { cache.current.set(code, found); if (live) setLook({ state: 'found', found }); })
        .catch((err) => {
          if (live) setLook({ state: 'error', message: err instanceof Error ? err.message : t('onboarding.pass.cannotCheck') });
        });
    }, PAUSE_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [code, t]);

  const found = look.state === 'found' ? look.found : null;
  const wrong = found?.kind === 'none' && code.length >= 8;

  // A recognised pass turns over; the keyboard has nothing left to do.
  useEffect(() => { if (found?.kind === 'invite' || found?.kind === 'org') input.current?.blur(); }, [found]);

  useEffect(() => {
    if (!wrong) return;
    shake.setValue(0);
    Animated.sequence([6, -6, 4, -4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 60, useNativeDriver: true }))).start();
  }, [wrong, shake]);

  const again = () => { setCode(''); setNote(''); setLook({ state: 'typing' }); setTimeout(() => input.current?.focus(), 450); };

  const accept = async () => {
    if (found?.kind !== 'invite') return;
    setBusy(true);
    try {
      await onboardingApi.acceptInvitation(found.code);
      await refreshUser(); // the navigation guard takes it from here
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('onboarding.useInvitation.failedToAccept'));
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    if (found?.kind !== 'org') return;
    setBusy(true);
    try {
      const result = await onboardingApi.submitJoinRequest({ orgCode: found.code, message: note.trim() || undefined });
      if (result?.autoApproved) {
        await refreshUser();
        router.replace('/(app)' as Href);
      } else {
        router.replace(ROUTES.pendingApproval as Href);
      }
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('onboarding.joinOrg.failedToSubmit'));
    } finally {
      setBusy(false);
    }
  };

  const name = personName(user);
  const company = found?.kind === 'invite' ? found.invite.organizationName : found?.kind === 'org' ? found.org.organizationName : undefined;
  const open = found?.kind === 'org' && found.org.joinPolicy === 'OPEN';

  const badge = useMemo(() => {
    if (found?.kind === 'invite') {
      const inv = found.invite;
      const days = daysLeft(inv.expiresAt);
      const role =
        inv.specialty ||
        (inv.targetRole
          ? t(`roles.${inv.targetRole}`, {
              defaultValue: inv.targetRole.charAt(0) + inv.targetRole.slice(1).toLowerCase(),
            })
          : '');
      return {
        face: inv.isExternal ? 'visitor' as const : 'staff' as const,
        strip: inv.isExternal ? t('onboarding.pass.stripGuest') : t('onboarding.pass.stripStaff'),
        role: inv.isExternal ? t('onboarding.pass.guestOf', { org: company }) : role,
        footLeft: days === null ? 'HBCFIELD' : t('onboarding.pass.validDays', { count: days }),
      };
    }
    if (found?.kind === 'org') {
      return {
        face: 'visitor' as const,
        strip: t('onboarding.pass.stripVisitor'),
        role: open ? t('onboarding.pass.straightIn') : t('onboarding.pass.adminLetsIn'),
        footLeft: 'HBCFIELD',
      };
    }
    return null;
  }, [found, company, open, t]);

  const heading = found?.kind === 'invite' ? t('onboarding.pass.headingYours')
    : found?.kind === 'org' ? (open ? t('onboarding.pass.headingOpen') : t('onboarding.pass.headingReception'))
    : user?.firstName ? t('onboarding.pass.headingNearly', { name: user.firstName }) : t('onboarding.pass.headingNearlyNoName');

  const status = wrong ? t('onboarding.pass.wrongCode')
    : look.state === 'error' ? look.message
    : found?.kind === 'none' ? t('onboarding.pass.keepTyping')
    : look.state === 'reading' ? t('onboarding.pass.reading')
    : '';

  return {
    amazen,
    c,
    t,
    router,
    user,
    code,
    setCode,
    look,
    note,
    setNote,
    busy,
    sheet,
    setSheet,
    input,
    shake,
    found,
    wrong,
    again,
    accept,
    ask,
    name,
    company,
    open,
    badge,
    heading,
    status,
  };
}
