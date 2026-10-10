import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { MEMBER_EMAIL_PREF, MEMBER_EMAILS, type MemberEmail } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { userApi } from '../../lib/api';
import { AText, PrimaryButton, Well } from '../amazen';
import { SectionLabel } from '../job/job-ui';
import { SettingsPage, StateCard, SwitchRow } from './settings-ui';

/** Where the switches used to live — on the phone, read by nothing. Moved to the account once, then forgotten. */
const OLD_PHONE_KEY = 'hbcfield_notification_prefs';

const PUSH = ['tasks', 'attendance', 'timeOff'] as const;
type Push = (typeof PUSH)[number];

const EMAIL_LABEL: Record<MemberEmail, string> = {
  taskAssigned: 'profile.notifications.emailTaskAssigned',
  taskCompleted: 'profile.notifications.emailTaskCompleted',
  autoClockOut: 'profile.notifications.emailAutoClockOut',
};

/**
 * NOTIFICATIONS — may this phone notify at all, what reaches you here, and
 * which emails you get.
 *
 * ⚠️ The three push switches did nothing: they were saved on the phone and the
 * server sent every push anyway. They are saved to the member now (the keys the
 * server already accepted), and the push sender checks them — `memberWantsPush`
 * in shared. A choice made before is carried over the first time this opens.
 */
export function NotificationsPage() {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const [permission, setPermission] = useState<{ granted: boolean } | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [orgAllows, setOrgAllows] = useState<Record<string, boolean>>({});

  const readPermission = useCallback(async () => {
    const p = await Notifications.getPermissionsAsync();
    setPermission({ granted: p.status === 'granted' });
  }, []);

  /* Back from the phone's settings → read it again. */
  useEffect(() => {
    void readPermission();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void readPermission(); });
    return () => sub.remove();
  }, [readPermission]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await userApi.getNotificationPrefs();
        let server = res?.prefs ?? {};
        /* A choice made when the switches lived on the phone — carried to the account once. */
        const old = await AsyncStorage.getItem(OLD_PHONE_KEY).catch(() => null);
        if (old) {
          const parsed = JSON.parse(old) as Partial<Record<Push, boolean>>;
          const carry = Object.fromEntries(PUSH.filter((k) => parsed[k] === false && server[k] === undefined).map((k) => [k, false]));
          if (Object.keys(carry).length) server = { ...server, ...(await userApi.updateNotificationPrefs(carry).catch(() => carry)) };
          await AsyncStorage.removeItem(OLD_PHONE_KEY).catch(() => undefined);
        }
        if (live) { setPrefs(server); setOrgAllows(res?.organizationAllows ?? {}); }
      } catch {
        if (live) setPrefs(null);
      }
    })();
    return () => { live = false; };
  }, []);

  const set = async (key: string, value: boolean) => {
    const before = prefs;
    setPrefs({ ...(prefs ?? {}), [key]: value });
    try {
      const saved = await userApi.updateNotificationPrefs({ [key]: value });
      setPrefs(saved ?? { ...(before ?? {}), [key]: value });
    } catch {
      setPrefs(before);
      toast.error(t('common.error'), t('settings.notif.saveFailed', 'Could not save that — try again.'));
    }
  };

  /*
    Ask; if the phone will not ask any more it answers "no" at once, and the
    phone's own settings are the only way — so one button does both, rather
    than guessing beforehand which of the two it will be.
  */
  const fixPermission = async () => {
    const p = await Notifications.requestPermissionsAsync();
    setPermission({ granted: p.status === 'granted' });
    if (p.status !== 'granted') await Linking.openSettings().catch(() => undefined);
  };

  const granted = permission?.granted ?? true;
  const on = (key: string) => prefs?.[key] !== false;
  const PUSH_TEXT: Record<Push, [string, string]> = {
    tasks: [t('settings.notif.jobs', 'Jobs'), t('settings.notif.jobsSub', 'Assigned to you, changed, a comment on yours')],
    attendance: [t('settings.notif.clock', 'Clock and shifts'), t('settings.notif.clockSub', 'Time to clock in, a rest, overtime answers')],
    timeOff: [t('settings.notif.timeOff', 'Time off'), t('settings.notif.timeOffSub', 'Your requests answered')],
  };

  return (
    <SettingsPage title={t('profile.notifications.title', 'Notifications')}>
      {/* First: may this phone notify at all. Everything below depends on it. */}
      <StateCard
        tone={granted ? 'accent' : 'warn'}
        mark={granted ? undefined : '!'}
        title={granted ? t('settings.notif.allowed', 'This phone can notify you') : t('settings.notif.blocked', 'Notifications are off for this app')}
        sub={granted ? t('settings.notif.allowedSub', "Allowed in the phone's settings") : t('settings.notif.blockedSub', "You will not hear about new jobs or your shift. Turn them on in the phone's settings.")}
      />
      {!granted ? <PrimaryButton label={t('settings.notif.allow', 'Allow notifications')} onPress={() => void fixPermission()} /> : null}

      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{t('settings.notif.onPhone', 'On this phone')}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {PUSH.map((k, i) => (
          <SwitchRow key={k} first={i === 0} title={PUSH_TEXT[k][0]} sub={PUSH_TEXT[k][1]} value={on(k)} onChange={(v) => void set(k, v)} disabled={!granted || prefs === null} />
        ))}
      </Well>

      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{t('settings.notif.byEmail', 'By email')}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {MEMBER_EMAILS.map((kind, i) => {
          const allowed = orgAllows[kind] !== false;
          const key = MEMBER_EMAIL_PREF[kind];
          return (
            <SwitchRow key={kind} first={i === 0} title={t(EMAIL_LABEL[kind])} value={allowed && on(key)} onChange={(v) => void set(key, v)}
              disabled={!allowed || prefs === null} note={allowed ? undefined : t('profile.notifications.emailOffByOrg')} />
          );
        })}
      </Well>

      {prefs === null ? <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>{t('settings.notif.offline', 'Needs a connection to change these.')}</AText> : null}
      <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingHorizontal: amazen.space(4) }}>
        {t('settings.notif.always', 'Messages from a colleague and anything that blocks your work always reach you.')}
      </AText>
    </SettingsPage>
  );
}
