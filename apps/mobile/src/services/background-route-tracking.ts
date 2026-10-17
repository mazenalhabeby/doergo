import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken, sessionOwnerId } from '../lib/api/client';
import i18n from '../i18n';
import { requestBackgroundLocationConsent } from './location-consent';
import { checkArrival, setRouteDestination, clearRouteDestination } from './route-arrival';
import { cleanRoutePoints, type RoutePoint } from '@hbcfield/shared/client';
import { PENDING_PREFIX } from './route-buffer';
import { lastPointKey, LAST_POINT_KEY } from '../lib/sealed-stores';
import { routeStore, flushPoints } from './route-upload';

/**
 * Background route tracking.
 *
 * Records the EXACT path a member drives while EN_ROUTE — not just start/end.
 * Uses expo-location's background updates (a TaskManager headless task), so it
 * keeps logging points even when the phone is locked or the app is backgrounded,
 * which is exactly when the previous foreground-only `setInterval` approach went
 * dark and produced a straight line.
 *
 * Battery: sampling is DISTANCE-based (every ~25m moved) rather than time-based,
 * so the GPS only reports while the member is actually moving — idle time (red
 * lights, on-site) costs nothing. Deliveries are deferred/batched so the radio
 * wakes in bursts, and each burst is flushed to the server in ONE request.
 *
 * NOTE: background location requires a dev/production build (not Expo Go). The
 * native config (iOS UIBackgroundModes, Android ACCESS_BACKGROUND_LOCATION +
 * foreground service) is already declared in app.config.ts.
 */

const ROUTE_TASK = 'ROUTE_TRACKING';
const ROUTE_TASK_KEY = 'active_route_task_id';

// A point every ~20 m moved — fine enough to draw every turn. Standing still
// produces nothing, which is most of what keeps this easy on the battery.
const DISTANCE_INTERVAL_M = 20;
// …and at least one every 15 s while moving (Android), so a slow crawl in a
// jam or the last stretch on foot still draws. iOS decides by distance alone.
const TIME_INTERVAL_MS = 15_000;
// Radio wake-ups are the expensive part: the OS may hold points this long and
// hand them over together, and they go to the server as ONE request.
const DEFERRED_INTERVAL_MS = 30_000;
// The last point kept, so a jump is judged across bursts and app restarts —
// per member and sealed (`lastPointKey`, lib/sealed-stores.ts): it is where
// somebody was. The old device-wide plaintext key is only ever removed (it
// costs one jump check, nothing more).

// Bursts that couldn't be delivered wait here until the next one succeeds.
/*
  ⚠️ ONE LIST PER MEMBER. A route is where a person drove. A device-wide list
  meant the points member A collected in a tunnel were uploaded with member B's
  token as soon as B signed in — onto B's route, as B's movements. The keys
  carry the session owner (the token's `sub`), only the owner's points are ever
  sent, and `forgetRouteData` removes every key at the end of a session.

  ⚠️ HELD IN SMALL CHUNKS (route-buffer.ts), not one value rewritten whole —
  that was up to ~400 KB of JSON written per burst, every 30 s, offline.
*/
const PENDING_KEY = PENDING_PREFIX;

interface RawLocation {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
}

// ── Background task — runs in a separate JS context, no React state access ──
TaskManager.defineTask(
  ROUTE_TASK,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations?: RawLocation[] }>) => {
    if (error) {
      console.error('[Route] Background task error:', error);
      return;
    }

    const locations: RawLocation[] | undefined = data?.locations;
    if (!locations?.length) return;

    // Stop ONLY on a genuine logout (token absent). A keychain read ERROR (e.g. a
    // transient failure) must NOT deregister the tracker — that would permanently
    // stop background GPS with no way to recover until the app is reopened. (H12.)
    let token: string | null;
    try {
      token = await getAccessToken();
    } catch {
      return; // transient read failure — skip this burst, keep tracking
    }
    if (!token) {
      await stopRouteTracking();
      return;
    }

    // Which task do these points belong to? Persisted because the headless task
    // can't see the React tree.
    const taskId = (await SecureStore.getItemAsync(ROUTE_TASK_KEY)) || undefined;

    const raw = locations.map((l) => ({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      accuracy: l.coords.accuracy ?? undefined,
      timestamp: new Date(l.timestamp).toISOString(),
    }));
    // The same rule the server applies (shared): no fix worse than ±50 m, no
    // impossible jump from the last point kept — so the line follows the road
    // instead of leaping across a field after a tunnel.
    const owner = await sessionOwnerId().catch(() => null);
    const previous = await loadLastPoint(owner);
    const points = cleanRoutePoints(raw, { previous });
    if (points.length) await saveLastPoint(owner, points[points.length - 1]);

    // flushPoints handles batch→per-point fallback and buffers what it can't
    // deliver, and never throws, so the background task can't crash here.
    await flushPoints(taskId, points);

    // Same positions, no extra GPS: has the member reached the job site? Prompts
    // them to mark Arrived, which is the step that's easy to forget and expensive
    // to forget — see route-arrival.ts.
    await checkArrival(points);
  },
);

/**
 * Start recording the member's route for a task. Idempotent — if already
 * running, it just re-points tracking at the new task id and destination.
 */
export async function startRouteTracking(
  taskId: string,
  destination?: { lat?: number | null; lng?: number | null; address?: string | null },
): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(ROUTE_TASK_KEY, taskId);
    // Stored now, from the caller that already has the task, so the headless
    // task can recognise arrival without a network round trip.
    await setRouteDestination(taskId, destination?.lat, destination?.lng, destination?.address);

    /*
      ⚠️ STARTED, NOT MERELY REGISTERED. A task stays registered after the OS
      stops the location service (a force-stop, a battery saver, an update),
      and asking only "registered?" returned early here — so a new trip began
      with GPS off and recorded nothing, silently. Ask whether updates are
      actually flowing, and start them if not.
    */
    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(ROUTE_TASK).catch(() => false);
    if (alreadyRunning) return true;
    // A fresh trip judges its first point on its own, not against the last trip's end.
    await forgetLastPoint();

    // Foreground permission is required to even start; background permission
    // makes it keep going when the screen is off. We start with whatever we
    // have — foreground-only still beats the old behaviour.
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    // Google Play: show the prominent in-app disclosure BEFORE requesting the OS
    // background-location permission. Only request it if the user accepts;
    // foreground-only tracking still works if they decline.
    if (await requestBackgroundLocationConsent()) {
      await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    }

    await Location.startLocationUpdatesAsync(ROUTE_TASK, {
      accuracy: Location.Accuracy.High, // ~10m — needed to trace roads/turns
      distanceInterval: DISTANCE_INTERVAL_M,
      timeInterval: TIME_INTERVAL_MS,
      deferredUpdatesInterval: DEFERRED_INTERVAL_MS,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true, // iOS blue bar
      // In the member's language — the notification sits on their lock screen for the whole drive.
      foregroundService: {
        notificationTitle: i18n.t('tracking.foreground.routeTitle'),
        notificationBody: i18n.t('tracking.foreground.routeBody'),
        notificationColor: '#2563EB',
      },
    });

    return true;
  } catch (err) {
    console.error('[Route] Failed to start:', err);
    return false;
  }
}

/**
 * Send the points held from a dead zone, now.
 *
 * They used to wait for the NEXT burst of a route — so a route that ended
 * without signal kept its gap until the member drove somewhere else, and past
 * the age limit it was never sent at all. Called when the connection comes
 * back, when the app is opened, and when tracking stops. Never throws.
 */
export async function flushPendingRoute(): Promise<void> {
  try {
    await flushPoints(undefined, []);
  } catch {
    /* held for the next attempt */
  }
}

/** Stop recording and clear the active task. */
export async function stopRouteTracking(): Promise<void> {
  // What is held belongs to the route that is ending; try to send it with it.
  void flushPendingRoute();
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(ROUTE_TASK).catch(() => false);
    const registered = await TaskManager.isTaskRegisteredAsync(ROUTE_TASK).catch(() => false);
    if (running || registered) {
      await Location.stopLocationUpdatesAsync(ROUTE_TASK);
    }
  } catch (err) {
    console.error('[Route] Failed to stop:', err);
  } finally {
    await SecureStore.deleteItemAsync(ROUTE_TASK_KEY).catch(() => undefined);
    await forgetLastPoint();
    await clearRouteDestination();
  }
}

/**
 * Sign-out: stop recording and wipe every held point from the phone. Somebody
 * else may sign in next, and a route is where a person was.
 */
export async function forgetRouteData(): Promise<void> {
  await stopRouteTracking().catch(() => undefined);
  // Every member's held points, and the old device-wide list from before they were keyed.
  const all = await Promise.resolve(AsyncStorage.getAllKeys?.()).catch(() => null);
  const keyed = (all ?? []).filter((k) => k.startsWith(`${PENDING_KEY}:`) || k.startsWith(`${LAST_POINT_KEY}:`));
  await AsyncStorage.multiRemove([PENDING_KEY, LAST_POINT_KEY, ...keyed]).catch(() => undefined);
}

async function forgetLastPoint(): Promise<void> {
  const owner = await sessionOwnerId().catch(() => null);
  const keys = owner ? [LAST_POINT_KEY, lastPointKey(owner)] : [LAST_POINT_KEY];
  await AsyncStorage.multiRemove(keys).catch(() => undefined);
}

async function loadLastPoint(owner: string | null): Promise<RoutePoint | null> {
  if (!owner) return null;
  try {
    const raw = await routeStore(owner).getItem(lastPointKey(owner));
    return raw ? (JSON.parse(raw) as RoutePoint) : null;
  } catch {
    return null;
  }
}

async function saveLastPoint(owner: string | null, p: RoutePoint): Promise<void> {
  if (!owner) return;
  try {
    await routeStore(owner).setItem(
      lastPointKey(owner),
      JSON.stringify({ lat: p.lat, lng: p.lng, timestamp: p.timestamp }),
    );
  } catch {
    /* only costs the jump check across one restart */
  }
}

/** Is the background route tracker currently registered? */
export async function isRouteTrackingRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(ROUTE_TASK);
  } catch {
    return false;
  }
}

/** The task id the tracker is currently recording for (if any). */
export async function getActiveRouteTaskId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ROUTE_TASK_KEY);
  } catch {
    return null;
  }
}
