import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { PUSH_CHANNELS } from '@hbcfield/shared/client';
import i18n, { i18nReady } from '../../i18n';
import type { OutboxOp } from '../outbox/types';
import { refusedShiftCopy, refusedShiftOps } from './refused-shift';

/*
  Telling the member, when the app is not in front of them, that a clock-in,
  clock-out or rest it had shown as done was refused.

  ⚠️ ONCE PER REFUSAL, ACROSS BOTH CONTEXTS. The app (in the background) and
  the background sync task (app closed) can each be the one that hears the
  refusal; the ids already told are kept on the phone so neither repeats it.
*/
const TOLD_KEY = 'refused_shift_told';
const KEEP = 50;

async function told(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(TOLD_KEY)) ?? '[]') as string[]; } catch { return []; }
}

/** Mark refusals as known without telling — the ones already there when the app opens. */
export async function markRefusedShiftsKnown(ops: readonly OutboxOp[]): Promise<void> {
  const ids = refusedShiftOps(ops).map((o) => o.id);
  if (!ids.length) return;
  const seen = await told();
  await AsyncStorage.setItem(TOLD_KEY, JSON.stringify([...new Set([...ids, ...seen])].slice(0, KEEP))).catch(() => undefined);
}

export async function notifyRefusedShifts(ops: readonly OutboxOp[]): Promise<void> {
  const refused = refusedShiftOps(ops);
  if (!refused.length) return;
  const seen = await told();
  const fresh = refused.filter((o) => !seen.includes(o.id));
  if (!fresh.length) return;
  await AsyncStorage.setItem(TOLD_KEY, JSON.stringify([...fresh.map((o) => o.id), ...seen].slice(0, KEEP))).catch(() => undefined);

  const { status } = await Notifications.getPermissionsAsync().catch(() => ({ status: 'denied' as const }));
  if (status !== 'granted') return;
  await i18nReady.catch(() => undefined);
  const locale = i18n.language;
  const copy = refusedShiftCopy(i18n.t.bind(i18n), fresh[0]!, {
    clock: (d) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }),
    date: (d) => d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }),
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.reason,
      // No route of its own: opening the app lands on the home card, which shows it.
      data: { type: 'shift_refused' },
      ...(Platform.OS === 'android' ? { channelId: PUSH_CHANNELS.ATTENDANCE } : {}),
    },
    trigger: null,
  }).catch(() => undefined);
}
