import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { haversineDistance } from '../lib/utils';
import i18n, { i18nReady } from '../i18n';

/**
 * "You've arrived" — detected from the route the app is already recording.
 *
 * A member taps Start driving, drives, parks, walks in, and gets on with the
 * job. Tapping Arrived is the easiest step to forget, and forgetting it has
 * consequences none of them would guess: the task sits in EN_ROUTE, and the
 * background GPS keeps recording. Their drive home lands on the job's route,
 * the distance figure is wrong, and their evening movements are logged against
 * a work task. Nothing in the system noticed, because nothing was looking.
 *
 * This looks. It costs no battery to do so: the route tracker is ALREADY
 * receiving positions every ~25 m while EN_ROUTE, so arrival is a distance
 * comparison on points we have in hand — no second geofence, no extra GPS, no
 * network. When the member comes within range of the destination, the phone
 * itself raises a notification. It suggests; it never changes the task's status
 * on their behalf. What a task's status says happened is the member's word, and
 * the point of the prompt is to remind them to give it — arriving near a place
 * is not the same as being there to work.
 */

const DESTINATION_KEY = 'active_route_destination';

/**
 * How close counts as arrived.
 *
 * Generous on purpose. Phone GPS in a built-up area is comfortably ±30 m, and
 * the destination pin is usually a street address rather than the door the
 * member actually walks through — a tight ring would simply never trigger for
 * an industrial estate or a large site. This is a prompt, not a payroll
 * boundary: too early is a notification the member ignores for a minute, too
 * late is the silence this exists to end.
 */
export const ARRIVAL_RADIUS_M = 150;

/**
 * Ignore fixes vaguer than this. A point that could be anywhere within 100 m
 * cannot honestly answer "are you within 150 m", and acting on one would fire
 * the prompt somewhere down the road.
 */
const MAX_USABLE_ACCURACY_M = 100;

/** Once outside this, treat a later approach as a fresh arrival. */
const RE_ARM_MULTIPLIER = 2;

export interface RouteDestination {
  taskId: string;
  lat: number;
  lng: number;
  /** Shown in the notification so the member knows which site is meant. */
  address?: string;
  /** Set once the prompt has fired, so it fires once and not once per point. */
  notified?: boolean;
}

async function readDestination(): Promise<RouteDestination | null> {
  try {
    const raw = await SecureStore.getItemAsync(DESTINATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RouteDestination;
    return typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

async function writeDestination(dest: RouteDestination): Promise<void> {
  try {
    await SecureStore.setItemAsync(DESTINATION_KEY, JSON.stringify(dest));
  } catch {
    // Without a stored destination there's no prompt — tracking is unaffected.
  }
}

/**
 * Remember where this route is headed. Called when tracking starts, from the
 * screen that already has the task loaded — so the headless task never has to
 * go to the network to learn the destination.
 */
export async function setRouteDestination(
  taskId: string,
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
): Promise<void> {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    // A task with no coordinates simply gets no arrival prompt.
    await clearRouteDestination();
    return;
  }
  await writeDestination({ taskId, lat, lng, address: address ?? undefined });
}

export async function clearRouteDestination(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DESTINATION_KEY);
  } catch {
    // ignore
  }
}

/** Has the member been told they've arrived at this task? Drives the in-app banner. */
export async function hasArrivalPrompt(taskId: string): Promise<boolean> {
  const dest = await readDestination();
  return !!dest?.notified && dest.taskId === taskId;
}

async function notifyArrived(dest: RouteDestination): Promise<void> {
  // Silence here means the member never hears about it, so a missing
  // permission is worth its own log line rather than a silent return.
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[Arrival] Notifications not permitted — no arrival prompt');
    return;
  }

  // The headless task runs in its own JS context with no React tree, so the
  // language comes from the same stored preference the app reads at startup.
  await i18nReady.catch(() => undefined);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('routeArrival.notificationTitle'),
      body: dest.address
        ? i18n.t('routeArrival.notificationBodyAt', { address: dest.address })
        : i18n.t('routeArrival.notificationBody'),
      // taskId is what the app's existing notification routing reads to deep
      // link — tapping this opens the task, where the Arrived button lives.
      data: { type: 'task.arrived', taskId: dest.taskId },
      ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
    },
    trigger: null, // deliver now
  });
}

export interface FixCandidate {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * The most recent fix worth trusting: where they are NOW, not where the burst
 * began — a burst can span several hundred metres of driving.
 */
export function pickLatestUsableFix<T extends FixCandidate>(points: T[]): T | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.accuracy === undefined || p.accuracy <= MAX_USABLE_ACCURACY_M) return p;
  }
  return null;
}

/**
 * What to do about a given distance from the destination. Pure, and separate
 * from the storage and notification it drives, so the rule can be read and
 * checked on its own.
 *
 * - `notify` — inside the ring and they haven't been told yet.
 * - `rearm`  — well clear again after being told: they left, or the pin was
 *              wrong and they drove past. A genuine later arrival should still
 *              get a prompt, so forget that we told them.
 * - `none`   — nothing to say. Note the deliberate dead band between the ring
 *              and the re-arm distance: without it, a member parked at the edge
 *              of the ring with GPS drifting a few metres either way would be
 *              re-armed and re-notified over and over.
 */
export function decideArrival(distanceM: number, alreadyNotified: boolean): 'notify' | 'rearm' | 'none' {
  if (distanceM <= ARRIVAL_RADIUS_M) return alreadyNotified ? 'none' : 'notify';
  if (alreadyNotified && distanceM > ARRIVAL_RADIUS_M * RE_ARM_MULTIPLIER) return 'rearm';
  return 'none';
}

/**
 * Check a burst of recorded positions against the destination and prompt once.
 *
 * Best-effort throughout: an arrival prompt that fails must never disturb the
 * route recording it rides along with.
 */
export async function checkArrival(points: FixCandidate[]): Promise<void> {
  try {
    const dest = await readDestination();
    if (!dest || !points.length) return;

    const latest = pickLatestUsableFix(points);
    if (!latest) return;

    const distance = haversineDistance(latest.lat, latest.lng, dest.lat, dest.lng);

    switch (decideArrival(distance, !!dest.notified)) {
      case 'notify':
        // Persist BEFORE notifying: if the notification throws, the member gets
        // no prompt, which is better than one on every burst from here on.
        await writeDestination({ ...dest, notified: true });
        await notifyArrived(dest);
        break;
      case 'rearm':
        await writeDestination({ ...dest, notified: false });
        break;
      case 'none':
        break;
    }
  } catch (err) {
    console.warn('[Arrival] Check failed:', err);
  }
}
