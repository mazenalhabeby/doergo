import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { PUSH_CHANNELS } from '@hbcfield/shared/client';
import i18n, { i18nReady } from '@/i18n';
import type { OutboxOp } from '../outbox/types';
import { refusedShiftCopy, refusedShiftOps } from './refused-shift';
import { refusedCrewCopy, refusedCrewOps } from '../tasks/refused-crew';

/*
  Telling the member, when the app is not in front of them, that a clock-in,
  clock-out or rest it had shown as done was refused — or a crew action on a
  job (join, leave, my issue, back to work, the lead: tasks/refused-crew.ts).

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
/** Every refusal the member may not have heard about — shift and crew alike. */
const refusedOf = (ops: readonly OutboxOp[]) => [...refusedShiftOps(ops), ...refusedCrewOps(ops)].sort((a, b) => b.createdAt - a.createdAt);

export async function markRefusedShiftsKnown(ops: readonly OutboxOp[]): Promise<void> {
  const ids = refusedOf(ops).map((o) => o.id);
  if (!ids.length) return;
  const seen = await told();
  await AsyncStorage.setItem(TOLD_KEY, JSON.stringify([...new Set([...ids, ...seen])].slice(0, KEEP))).catch(() => undefined);
}

export async function notifyRefusedShifts(ops: readonly OutboxOp[]): Promise<void> {
  const refused = refusedOf(ops);
  if (!refused.length) return;
  const seen = await told();
  const fresh = refused.filter((o) => !seen.includes(o.id));
  if (!fresh.length) return;
  await AsyncStorage.setItem(TOLD_KEY, JSON.stringify([...fresh.map((o) => o.id), ...seen].slice(0, KEEP))).catch(() => undefined);

  const { status } = await Notifications.getPermissionsAsync().catch(() => ({ status: 'denied' as const }));
  if (status !== 'granted') return;
  await i18nReady.catch(() => undefined);
  const locale = i18n.language;
  const op = fresh[0]!;
  const crew = refusedCrewOps([op]).length > 0;
  const copy = crew
    ? refusedCrewCopy(i18n.t.bind(i18n), op)
    : refusedShiftCopy(i18n.t.bind(i18n), op, {
        clock: (d) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }),
        date: (d) => d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }),
      });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.reason,
      // A shift refusal opens on the home card; a crew one on its job, whose crew card shows it.
      data: crew ? { type: 'task_crew_refused', taskId: op.entityId } : { type: 'shift_refused' },
      ...(Platform.OS === 'android' ? { channelId: crew ? PUSH_CHANNELS.TASKS : PUSH_CHANNELS.ATTENDANCE } : {}),
    },
    trigger: null,
  }).catch(() => undefined);
}
