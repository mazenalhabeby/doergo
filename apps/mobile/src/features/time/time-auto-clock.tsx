import React, { useState, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AUTO_CLOCK_UNDO_MINUTES, showAutoClockSwitch } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { isExternalMember } from '../../lib/member-reach';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { ensureBackgroundLocation } from '../../services/background-permission';
import { autoClockStatus, refreshAutoClock, setAutoClockConsent } from '../../services/auto-clock/plan';
import { AText, GhostButton, PrimaryButton, Well, SectionLabel } from '../../components/amazen';
import { JobSheet } from '../job/job-ui';
import { SwitchRow } from '../settings/settings-ui';

/**
 * AUTOMATIC CLOCK — the member's own switch, on the Time tab.
 *
 * Shown wherever the server has the feature (an older one answers 404 and the
 * card is not drawn). Switching it on is a CONSENT: the sheet says, in plain
 * words, what is recorded, who sees it and how to stop — and only "Switch on"
 * there records it. Switching off needs no sheet and works with no signal.
 */
export function TimeAutoClock() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const status = useSyncExternalStore(autoClockStatus.subscribe, autoClockStatus.get, autoClockStatus.get);
  const [sheet, setSheet] = useState<'consent' | 'about' | null>(null);
  const [busy, setBusy] = useState(false);

  // An external member holds no clock — the server refuses their consent, so the switch is never offered.
  if (isExternalMember(user)) return null;
  if (status.availability !== 'yes' && status.availability !== 'engine') return null;
  // Offered only where a workspace has chosen them — or once they agreed, so they can always switch it off.
  if (!showAutoClockSwitch({ consentAt: status.consentAt, offered: status.offered })) return null;
  const member = user?.id && user.organizationId ? { userId: user.id, organizationId: user.organizationId } : null;
  const on = !!status.consentAt;
  const usable = status.availability === 'yes';

  // Named, so somebody in several workspaces reads WHERE it works — never "everywhere".
  const where = status.offeredIn?.length ? status.offeredIn.join(', ') : null;
  const sub = !usable
    ? t('autoClock.notOnThisPhone')
    : !on
      ? where ? t('autoClock.subOffAt', { places: where }) : t('autoClock.subOff')
      : status.places === 0
        ? t('autoClock.subNotChosen')
        : where ? t('autoClock.subOnAt', { places: where }) : t('autoClock.subOn', { count: status.armed || status.places });

  const decide = async (consent: boolean) => {
    if (!member) return;
    /*
      ⚠️ The sheet goes BEFORE switching on, not after. Switching on can show the
      background-location disclosure, and iOS presents one modal at a time: with
      this sheet still up the disclosure was refused, its promise never settled
      and "Switch on" spun for good (blur-sheet.tsx, the one modal slot).
    */
    setSheet(null);
    setBusy(true);
    try {
      const r = await setAutoClockConsent(member, consent);
      if (r === 'on') toast.success(t('autoClock.turnedOn'));
      else if (r === 'needs-always') toast.warning(t('autoClock.turnedOn'), t('autoClock.needsAlways'));
      else if (r === 'off') toast.info(t('autoClock.turnedOff'));
      else if (r === 'offline') toast.error(t('common.error'), t('autoClock.offline'));
      else toast.error(t('common.error'), t('autoClock.failed'));
    } finally {
      setBusy(false);
    }
  };

  const allowAlways = async () => {
    if (!member) return;
    if (await ensureBackgroundLocation()) await refreshAutoClock(member);
  };

  return (
    <Well style={{ paddingHorizontal: amazen.space(3.5), paddingTop: amazen.space(3.25), paddingBottom: amazen.space(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>{t('autoClock.title')}</SectionLabel>
        <Pressable onPress={() => setSheet('about')} hitSlop={10} accessibilityRole="button">
          <AText variant="caption" tone="accent" style={{ fontSize: 12.5 }}>{t('autoClock.how')}</AText>
        </Pressable>
      </View>
      <SwitchRow
        first
        title={t('autoClock.toggle')}
        sub={sub}
        value={on}
        disabled={busy || !usable || !member}
        note={on && usable && status.places > 0 && status.background === 'missing' ? t('autoClock.needsAlways') : undefined}
        onChange={(v) => (v ? setSheet('consent') : void decide(false))}
      />
      {on && usable && status.places > 0 && status.background === 'missing' ? (
        <Pressable onPress={() => void allowAlways()} hitSlop={6} accessibilityRole="button" style={{ paddingBottom: amazen.space(2.5) }}>
          <AText variant="caption" tone="accent" style={{ fontSize: 13 }}>{t('autoClock.allowAlways')}</AText>
        </Pressable>
      ) : null}

      <JobSheet visible={sheet !== null} onClose={() => setSheet(null)} title={t('autoClock.consent.title')} busy={busy}>
        <View style={{ gap: amazen.space(3) }}>
          {(['what', 'who', 'undo', 'withdraw'] as const).map((k) => (
            <View key={k} style={{ gap: 2 }}>
              <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{t(`autoClock.consent.${k}Title`)}</AText>
              <AText variant="caption" style={{ color: c.inkMuted, fontSize: 13.5, lineHeight: 19 }}>
                {t(`autoClock.consent.${k}`, { minutes: AUTO_CLOCK_UNDO_MINUTES })}
              </AText>
            </View>
          ))}
        </View>
        {sheet === 'consent' ? (
          <View style={{ gap: amazen.space(2) }}>
            <PrimaryButton label={t('autoClock.consent.agree')} onPress={() => void decide(true)} loading={busy} disabled={busy} />
            <GhostButton label={t('autoClock.consent.notNow')} onPress={() => setSheet(null)} disabled={busy} />
          </View>
        ) : null}
      </JobSheet>
    </Well>
  );
}
