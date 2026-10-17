import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import i18n, { i18nReady } from '../i18n';
import { sessionOwnerId } from '../lib/api/client';
import { flushPendingRoute } from '../services/background-route-tracking';
import { loadBackgroundTask, loadNetInfo } from './native';
import { OPEN_STATES } from './outbox/types';
import { STUCK_AFTER_MS, stuckFor } from './outbox/stuck';
import { connectivity, createOfflineRuntime } from './runtime';
import { reportTelemetry } from './telemetry';
import { notifyRefusedShifts } from './attendance/refused-shift-notify';
import { autoClockWake } from '../services/auto-clock/context';

/*
  Sending what waits, now and then, with the app closed.

  ⚠️ BEST EFFORT, AND SAID SO. Android runs it through WorkManager roughly every
  fifteen minutes when it likes; iOS runs it rarely, and never after the app is
  swiped away. Sync is GUARANTEED on opening the app, returning to it and the
  connection coming back — this is a bonus on top, and nothing may depend on it.

  It runs in its own JS context with no React tree: who is signed in comes
  from the keychain, and the runtime is built by the same factory the app uses,
  so the Wi-Fi-only rule and every store are the same ones.
*/
const BACKGROUND_SYNC_TASK = 'HBC_OFFLINE_SYNC';
const MEMBER_KEY = 'offline_background_member';
const STUCK_WARNED_KEY = 'offline_stuck_warned_at';

interface Member {
  userId: string;
  organizationId: string;
}


/**
 * Tell the member — once a day at most — that work has been waiting on this
 * phone for a day. The one loss offline mode cannot prevent is a phone lost
 * before it syncs; making "unsent for a day" visible is the only defence.
 */
async function warnIfStuck(ops: readonly { state: string; createdAt: number }[]): Promise<void> {
  const age = stuckFor(ops, Date.now());
  if (age === null) return;
  const last = Number((await AsyncStorage.getItem(STUCK_WARNED_KEY).catch(() => null)) ?? 0);
  if (Date.now() - last < STUCK_AFTER_MS) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await i18nReady.catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('offline.stuck.title'),
      body: i18n.t('offline.stuck.body', { count: ops.filter((o) => OPEN_STATES.has(o.state as never)).length }),
      data: { type: 'offline.sync' },
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    },
    trigger: null,
  });
  await AsyncStorage.setItem(STUCK_WARNED_KEY, String(Date.now())).catch(() => undefined);
}

/**
 * May the queued work of `member` be sent with the tokens on this phone now?
 *
 * ⚠️ ONLY WHEN THE TOKENS ARE THE MEMBER'S OWN. The member record and the tokens
 * are stored separately, and nothing tied them together: member A signs out
 * with unsent work, member B signs in, and the next background run opened A's
 * queue and sent A's clock-in with B's token — filed on B, as B. The tokens say
 * whose they are (`sub`); anything else is somebody else's session.
 */
export function mayRunFor(member: Member | null, tokenOwner: string | null): member is Member {
  return !!member && !!member.userId && !!tokenOwner && member.userId === tokenOwner;
}

export async function runOnce(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(MEMBER_KEY).catch(() => null);
  if (!raw) return true;
  let member: Member | null = null;
  try {
    member = JSON.parse(raw) as Member;
  } catch {
    return true;
  }
  // Signed out since, or somebody else is signed in now: nothing is sent as anybody.
  if (!mayRunFor(member, await sessionOwnerId())) return true;

  // The monitor is not running in this context; ask once whether this is Wi-Fi.
  const state = await loadNetInfo()?.default.fetch().catch(() => null);
  if (state) {
    const expensive = (state.details as { isConnectionExpensive?: boolean } | null)?.isConnectionExpensive;
    connectivity.setUnmetered(state.isConnected !== false && (state.type === 'wifi' || state.type === 'ethernet') && expensive !== true);
  }

  const runtime = await createOfflineRuntime(member);
  if (!runtime) return true;
  try {
    await runtime.engine.flush();
    // The automatic clock's held arrival or departure, once its dwell or grace has passed.
    await autoClockWake({ using: { engine: runtime.engine, records: runtime.records } });
    await flushPendingRoute();
    await warnIfStuck(runtime.engine.operations());
    // A clock-in this run sent and the server refused: the member is told now, not when they next open the app.
    await notifyRefusedShifts(runtime.engine.operations()).catch(() => undefined);
    await reportTelemetry(runtime.engine, runtime.files);
    return true;
  } finally {
    runtime.engine.stop();
  }
}

/*
  Defined at module scope, as TaskManager requires: the OS may start the JS
  context for this task alone, and the definition must exist before it asks.
*/
if (loadBackgroundTask()) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    const lib = loadBackgroundTask()!;
    try {
      return (await runOnce()) ? lib.BackgroundTaskResult.Success : lib.BackgroundTaskResult.Failed;
    } catch {
      return lib.BackgroundTaskResult.Failed;
    }
  });
}

/** Start background sync for the signed-in member. Harmless to call again. */
export async function registerBackgroundSync(member: Member): Promise<void> {
  const lib = loadBackgroundTask();
  if (!lib) return;
  try {
    await SecureStore.setItemAsync(MEMBER_KEY, JSON.stringify(member), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) return;
    // Minutes; the OS treats it as a floor, never a promise.
    await lib.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
  } catch (err) {
    console.warn('[offline] background sync not registered:', err);
  }
}

/** Stop it — on sign-out, once nothing is left to send. */
export async function unregisterBackgroundSync(): Promise<void> {
  await SecureStore.deleteItemAsync(MEMBER_KEY).catch(() => undefined);
  const lib = loadBackgroundTask();
  if (!lib) return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) await lib.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  } catch {
    /* not registered */
  }
}
