import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { joinCodeCandidates, personName } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { invitationsApi, onboardingApi } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import { cleanPassCode, daysLeft, lookUpPassCode, type PassLookup } from '@/lib/pass-code';
import { AText, PrimaryButton } from '@/components/amazen';
import { JobSheet } from '../job/job-ui';
import { PassBadge } from './pass-badge';
import { PassAlternatives, PassFrame } from './pass-frame';
import { usePassScreen } from './use-pass-screen';
import { CELLS, INK } from './pass-screen-helpers';

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
  const {
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
  } = usePassScreen({ initialCode });

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
                    style={{
                      color: c.inkStrong,
                      fontFamily: amazen.font.sans,
                      fontSize: 14.5,
                      backgroundColor: c.sunken,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: c.lineWell,
                      paddingHorizontal: amazen.space(3.5),
                      paddingVertical: amazen.space(3),
                    }}
                    accessibilityLabel={t('onboarding.pass.notePlaceholder')}
                  />
                ) : null}
                <PrimaryButton
                  label={open ? t('onboarding.pass.joinNow') : t('onboarding.pass.askReception')}
                  loading={busy}
                  onPress={() => void ask()}
                />
              </>
            ) : null}
            <PassAlternatives
              items={found?.kind === 'invite' || found?.kind === 'org'
                ? [
                    { label: t('onboarding.pass.anotherCode'), onPress: again },
                    { label: t('onboarding.pass.startCompany'), onPress: () => setSheet('start') },
                  ]
                : [
                    { label: t('onboarding.pass.startCompany'), onPress: () => setSheet('start') },
                    { label: t('onboarding.pass.noCode'), onPress: () => setSheet('nocode') },
                  ]}
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
          <AText style={{ color: '#0b8168', fontFamily: amazen.font.mono, fontSize: 10, letterSpacing: 2 }}>
            {t('onboarding.pass.yourPass')}
          </AText>
          <AText
            style={{
              color: INK,
              fontSize: 19,
              lineHeight: 24,
              textAlign: 'center',
              marginTop: 8,
              fontFamily: amazen.font.sans,
            }}
          >
            {t('onboarding.pass.typeCode')}
          </AText>
          <AText style={{ color: '#4b5d57', fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 4 }}>
            {t('onboarding.pass.cameFrom')}
          </AText>
          <Pressable
            onPress={() => input.current?.focus()}
            accessibilityLabel={t('onboarding.pass.codeLabel')}
            style={{ marginTop: 16, gap: 8 }}>
            {[0, 5].map((start) => (
              <Animated.View key={start} style={{ flexDirection: 'row', gap: 7, transform: [{ translateX: shake }] }}>
                {Array.from({ length: CELLS / 2 }, (_, j) => {
                  const i = start + j;
                  const ch = code[i];
                  const cursor = i === code.length;
                  return (
                    <View
                      key={i}
                      style={{
                        width: 40,
                        height: 48,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: ch ? '#ffffff' : `${INK}0d`,
                        borderWidth: 1.5,
                        borderColor: wrong ? '#b3392c' : cursor ? '#10b993' : ch ? `${INK}26` : 'transparent',
                      }}>
                      <AText style={{ color: wrong ? '#b3392c' : INK, fontFamily: amazen.font.monoMedium, fontSize: 20 }}>{ch ?? ''}</AText>
                    </View>
                  );
                })}
              </Animated.View>
            ))}
          </Pressable>
          <AText
            style={{
              marginTop: 12,
              minHeight: 34,
              textAlign: 'center',
              fontSize: 12.5,
              lineHeight: 17,
              color: wrong || look.state === 'error' ? '#b3392c' : '#4b5d57',
            }}
          >
            {status}
          </AText>
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
