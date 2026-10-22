import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useOffline } from '../../offline/offline-context';
import { updateOwnProfile } from '../../offline/profile/profile-actions';
import { userApi } from '../../lib/api';
import { changeLanguage, getCurrentLanguage, supportedLanguages } from '../../i18n';
import { getAmazen } from '../../theme/amazen';
import { AText } from '../../components/amazen';
import { ChoiceRow, SettingsPage } from './settings-ui';
import { useShift } from '../../offline/attendance/use-shift';
import { parseClockInPick, type ClockInPick } from '@hbcfield/shared/client';

/* ─────────────────────────── Appearance ─────────────────────────── */

/** A small picture of the app in a scheme: its ground on top, a card below. */
function Swatch({ mode }: { mode: ThemeMode }) {
  const light = getAmazen('light').color;
  const dark = getAmazen('dark').color;
  const half = (a: string, b: string) => (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1, backgroundColor: a }} />
      <View style={{ flex: 1, backgroundColor: b }} />
    </View>
  );
  const pick = mode === 'light' ? [light, light] : mode === 'dark' ? [dark, dark] : [light, dark];
  return (
    <View style={{ width: 48, height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(127,127,127,0.25)' }}>
      {half(pick[0]!.tile, pick[1]!.tile)}
      {half(pick[0]!.well, pick[1]!.well)}
    </View>
  );
}

/** How the app looks. It changes as you tap — nothing to save. */
export function AppearancePage() {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();
  const OPTIONS: { mode: ThemeMode; sub: string }[] = [
    { mode: 'system', sub: t('settings.theme.systemSub', 'Light or dark, as the phone is') },
    { mode: 'light', sub: t('settings.theme.lightSub', 'Best in bright sun') },
    { mode: 'dark', sub: t('settings.theme.darkSub', 'Easy on the eyes at night') },
  ];
  return (
    <SettingsPage title={t('profile.theme.title', 'Appearance')}>
      <AText variant="body" tone="onGlass" style={{ paddingHorizontal: amazenPad }}>
        {t('settings.theme.lede', 'How the app looks. It changes as you tap.')}
      </AText>
      {OPTIONS.map((o) => (
        <ChoiceRow
          key={o.mode}
          on={mode === o.mode}
          onPress={() => setMode(o.mode)}
          title={o.mode === 'system' ? t('settings.theme.system', 'Same as the phone') : t(`profile.theme.${o.mode}`)}
          sub={o.sub}
          lead={<Swatch mode={o.mode} />}
        />
      ))}
    </SettingsPage>
  );
}
const amazenPad = 4;

/* ─────────────────────────── Time format ─────────────────────────── */

/** Both ways, written out — the choice is obvious once you see your kind of time in it. */
export function TimeFormatPage() {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { user, refreshUser, patchUser } = useAuth();
  const offline = useOffline();
  const toast = useToast();
  const current: '24h' | '12h' = user?.timeFormat === '12h' ? '12h' : '24h';
  const [saving, setSaving] = useState(false);

  const choose = async (value: '24h' | '12h') => {
    if (value === current || saving) return;
    setSaving(true);
    try {
      if (offline.engine && user?.id) {
        const outcome = await updateOwnProfile(offline.engine, user.id, { timeFormat: value });
        if (outcome.kind === 'refused') throw new Error(outcome.message);
        patchUser({ timeFormat: value });
        if (outcome.kind === 'queued') toast.success(t('offline.savedForLater'));
        return;
      }
      await userApi.setTimeFormat(value);
      await refreshUser();
    } catch {
      toast.error(t('profile.timeFormat.failed'));
    } finally {
      setSaving(false);
    }
  };

  const OPTIONS: { value: '24h' | '12h'; now: string; shift: string }[] = [
    { value: '24h', now: '14:30', shift: '07:00 – 15:30' },
    { value: '12h', now: '2:30 PM', shift: '7:00 AM – 3:30 PM' },
  ];
  return (
    <SettingsPage title={t('profile.timeFormat.title', 'Time format')}>
      <AText variant="body" tone="onGlass" style={{ paddingHorizontal: amazenPad }}>
        {t('settings.time.lede', 'How times are written everywhere in the app.')}
      </AText>
      {OPTIONS.map((o) => (
        <ChoiceRow
          key={o.value}
          on={current === o.value}
          disabled={saving}
          onPress={() => void choose(o.value)}
          title={t(`profile.timeFormat.${o.value}`)}
          sub={
            <View style={{ gap: 2, marginTop: 4 }}>
              <AText numeric style={{ fontFamily: amazen.font.mono, fontSize: 20, color: amazen.color.inkStrong }}>{o.now}</AText>
              <AText variant="caption" tone="muted">
                {t('settings.time.shift', { shift: o.shift, defaultValue: 'A shift: {{shift}}' })}
              </AText>
            </View>
          }
        />
      ))}
      <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>{t('profile.timeFormat.note')}</AText>
    </SettingsPage>
  );
}

/* ─────────────────────────── Clock in ─────────────────────────── */

/**
 * With several workspaces: clock in where I stand, or always choose
 * (`User.clockInPick`, read by the Clock in button through the shared
 * `chooseClockInLocation` — the web reads the same setting). Where the member MAY
 * clock in is the server's either way.
 */
export function ClockInPickPage() {
  const { t } = useTranslation();
  const { user, refreshUser, patchUser } = useAuth();
  const offline = useOffline();
  const toast = useToast();
  const places = useShift().status?.assignedLocations ?? [];
  const current: ClockInPick = parseClockInPick(user?.clockInPick);
  const [saving, setSaving] = useState(false);

  const choose = async (value: ClockInPick) => {
    if (value === current || saving) return;
    setSaving(true);
    try {
      if (offline.engine && user?.id) {
        const outcome = await updateOwnProfile(offline.engine, user.id, { clockInPick: value });
        if (outcome.kind === 'refused') throw new Error(outcome.message);
        patchUser({ clockInPick: value });
        if (outcome.kind === 'queued') toast.success(t('offline.savedForLater'));
        return;
      }
      await userApi.setClockInPick(value);
      await refreshUser();
    } catch {
      toast.error(t('settings.clockIn.failed'));
    } finally {
      setSaving(false);
    }
  };

  const OPTIONS: { value: ClockInPick; title: string; sub: string }[] = [
    { value: 'AUTO', title: t('settings.clockIn.autoTitle'), sub: t('settings.clockIn.autoHint') },
    { value: 'ASK', title: t('settings.clockIn.askTitle'), sub: t('settings.clockIn.askHint') },
  ];
  return (
    <SettingsPage title={t('settings.clockIn.title')}>
      <AText variant="body" tone="onGlass" style={{ paddingHorizontal: amazenPad }}>{t('settings.clockIn.question')}</AText>
      {OPTIONS.map((o) => (
        <ChoiceRow
          key={o.value}
          on={current === o.value}
          disabled={saving}
          onPress={() => void choose(o.value)}
          title={o.title}
          sub={o.sub}
        />
      ))}
      {places.length > 1 ? (
        <AText variant="caption" tone="onGlass" style={{ paddingHorizontal: amazenPad }}>
          {t('settings.clockIn.workspaces', { n: places.length, names: places.map((p) => p.name).join(', ') })}
        </AText>
      ) : null}
      <AText variant="caption" tone="onGlass" style={{ paddingHorizontal: amazenPad }}>{t('settings.clockIn.footnote')}</AText>
    </SettingsPage>
  );
}

/* ─────────────────────────── Language ─────────────────────────── */

/**
 * A line in each language, written in it — so the member reads their own
 * language rather than recognising a flag. ⚠️ Flags are multi-colour icons,
 * and a flag is a country, not a language.
 */
const GREETING: Record<string, string> = {
  en: 'Good morning',
  de: 'Guten Morgen',
  es: 'Buenos días',
  fr: 'Bonjour',
  it: 'Buongiorno',
};

export function LanguagePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const offline = useOffline();
  const [current, setCurrent] = useState(getCurrentLanguage());

  const choose = useCallback((code: string) => {
    if (code === current) return;
    setCurrent(code);
    void changeLanguage(code);
    // Saved to the account: the emails HBCField sends this member follow it.
    if (offline.engine && user?.id) void updateOwnProfile(offline.engine, user.id, { locale: code }).catch(() => undefined);
    else userApi.setLocale(code).catch(() => undefined);
  }, [current, offline.engine, user?.id]);

  return (
    <SettingsPage title={t('profile.menu.language', 'Language')}>
      {supportedLanguages.map((l) => (
        <ChoiceRow key={l.code} on={current === l.code} onPress={() => choose(l.code)} title={l.label}
          sub={`${GREETING[l.code] ?? ''}${user?.firstName ? `, ${user.firstName}` : ''}`} />
      ))}
      <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
        {t('settings.lang.emails', 'Your emails from HBCField come in this language too.')}
      </AText>
    </SettingsPage>
  );
}
