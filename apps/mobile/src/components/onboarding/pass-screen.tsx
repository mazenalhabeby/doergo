import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { joinCodeCandidates } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { invitationsApi, onboardingApi } from '../../lib/api';
import { ROUTES } from '../../lib/constants';
import { cleanPassCode, daysLeft, lookUpPassCode, type PassLookup } from '../../lib/pass-code';
import { AText, PrimaryButton } from '../amazen';
import { JobSheet } from '../job/job-ui';
import { PassBadge } from './pass-badge';
import { PassAlternatives, PassFrame } from './pass-frame';

const CELLS = 10;
const PAUSE_MS = 700;
const INK = '#0b1f1a';

type Look = { state: 'typing' | 'reading' } | { state: 'found'; found: PassLookup } | { state: 'error'; message: string };

/**
 * THE FIRST SCREEN AFTER SIGN-UP: one pass, and the code goes onto it.
 *
 * It replaced three equal cards (create / join / invitation) that made
 * everybody decide which kind of code they were holding before they could
 * type it. Nearly everyone arrives with an invitation, so the field is the
 * whole screen; the code is recognised as either kind as it is typed, and the
 * pass turns over to show whose it is before anything is joined. Starting a
 * company and "no code" are two quiet choices underneath.
 */
export function PassScreen({ initialCode }: { initialCode?: string }) {
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
        .catch((err) => { if (live) setLook({ state: 'error', message: err instanceof Error ? err.message : t('onboarding.pass.cannotCheck') }); });
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

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const company = found?.kind === 'invite' ? found.invite.organizationName : found?.kind === 'org' ? found.org.organizationName : undefined;
  const open = found?.kind === 'org' && found.org.joinPolicy === 'OPEN';

  const badge = useMemo(() => {
    if (found?.kind === 'invite') {
      const inv = found.invite;
      const days = daysLeft(inv.expiresAt);
      const role = inv.specialty || (inv.targetRole ? t(`roles.${inv.targetRole}`, { defaultValue: inv.targetRole.charAt(0) + inv.targetRole.slice(1).toLowerCase() }) : '');
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

  return (
    <>
      <PassFrame
        heading={heading}
        dock={
          <>
            {found?.kind === 'invite' ? (
              <PrimaryButton label={t('onboarding.pass.putItOn')} loading={busy} onPress={() => void accept()} />
            ) : found?.kind === 'org' ? (
              <>
                {!open ? (
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('onboarding.pass.notePlaceholder')}
                    placeholderTextColor={c.inkMuted}
                    maxLength={500}
                    style={{ color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14.5, backgroundColor: c.sunken, borderRadius: 14, borderWidth: 1, borderColor: c.lineWell, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(3) }}
                    accessibilityLabel={t('onboarding.pass.notePlaceholder')}
                  />
                ) : null}
                <PrimaryButton label={open ? t('onboarding.pass.joinNow') : t('onboarding.pass.askReception')} loading={busy} onPress={() => void ask()} />
              </>
            ) : null}
            <PassAlternatives
              items={found?.kind === 'invite' || found?.kind === 'org'
                ? [{ label: t('onboarding.pass.anotherCode'), onPress: again }, { label: t('onboarding.pass.startCompany'), onPress: () => setSheet('start') }]
                : [{ label: t('onboarding.pass.startCompany'), onPress: () => setSheet('start') }, { label: t('onboarding.pass.noCode'), onPress: () => setSheet('nocode') }]}
            />
          </>
        }
      >
        <PassBadge
          face={badge?.face ?? 'blank'}
          strip={badge?.strip}
          company={company}
          name={name}
          role={badge?.role}
          roleTone={badge?.face === 'staff' ? 'accent' : 'warn'}
          footLeft={badge?.footLeft}
          footRight={found?.code}
        >
          <AText style={{ color: '#0b8168', fontFamily: amazen.font.mono, fontSize: 10, letterSpacing: 2 }}>{t('onboarding.pass.yourPass')}</AText>
          <AText style={{ color: INK, fontSize: 19, lineHeight: 24, textAlign: 'center', marginTop: 8, fontFamily: amazen.font.sans }}>{t('onboarding.pass.typeCode')}</AText>
          <AText style={{ color: '#4b5d57', fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 4 }}>{t('onboarding.pass.cameFrom')}</AText>
          <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t('onboarding.pass.codeLabel')} style={{ marginTop: 16, gap: 8 }}>
            {[0, 5].map((start) => (
              <Animated.View key={start} style={{ flexDirection: 'row', gap: 7, transform: [{ translateX: shake }] }}>
                {Array.from({ length: CELLS / 2 }, (_, j) => {
                  const i = start + j;
                  const ch = code[i];
                  const cursor = i === code.length;
                  return (
                    <View key={i} style={{ width: 40, height: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ch ? '#ffffff' : `${INK}0d`, borderWidth: 1.5, borderColor: wrong ? '#b3392c' : cursor ? '#10b993' : ch ? `${INK}26` : 'transparent' }}>
                      <AText style={{ color: wrong ? '#b3392c' : INK, fontFamily: amazen.font.monoMedium, fontSize: 20 }}>{ch ?? ''}</AText>
                    </View>
                  );
                })}
              </Animated.View>
            ))}
          </Pressable>
          <AText style={{ marginTop: 12, minHeight: 34, textAlign: 'center', fontSize: 12.5, lineHeight: 17, color: wrong || look.state === 'error' ? '#b3392c' : '#4b5d57' }}>{status}</AText>
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => setCode(cleanPassCode(v))}
            autoFocus={!initialCode}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            textContentType="oneTimeCode"
            maxLength={CELLS}
            caretHidden
            accessibilityLabel={t('onboarding.pass.codeLabel')}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          />
        </PassBadge>
      </PassFrame>

      <JobSheet visible={sheet === 'start'} onClose={() => setSheet(null)} title={t('onboarding.pass.startTitle')}>
        <AText variant="body" tone="onGlass" style={{ fontSize: 14, lineHeight: 21 }}>{t('onboarding.pass.startBody')}</AText>
        <PrimaryButton
          label={t('onboarding.pass.startButton')}
          style={{ marginTop: amazen.space(4) }}
          onPress={() => { setSheet(null); setTimeout(() => router.push(ROUTES.createOrg as Href), 280); }}
        />
      </JobSheet>

      <JobSheet visible={sheet === 'nocode'} onClose={() => setSheet(null)} title={t('onboarding.pass.noCodeTitle')}>
        <AText variant="body" tone="onGlass" style={{ fontSize: 14, lineHeight: 21 }}>{t('onboarding.pass.noCodeBody')}</AText>
        {user?.email ? (
          <View style={{ marginTop: amazen.space(3), backgroundColor: c.sunken, borderRadius: 14, padding: amazen.space(3.5) }}>
            <AText selectable style={{ color: c.inkStrong, fontFamily: amazen.font.mono, fontSize: 14 }}>{user.email}</AText>
          </View>
        ) : null}
        <PrimaryButton
          label={t('onboarding.pass.haveCodeNow')}
          style={{ marginTop: amazen.space(4) }}
          onPress={() => { setSheet(null); setTimeout(() => input.current?.focus(), 320); }}
        />
      </JobSheet>
    </>
  );
}
