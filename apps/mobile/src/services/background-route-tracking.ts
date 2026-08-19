import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackingApi, ApiError } from '../lib/api';
import { getAccessToken } from '../lib/api/client';
import { requestBackgroundLocationConsent } from './location-consent';
import { checkArrival, setRouteDestination, clearRouteDestination } from './route-arrival';

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

// Log a point roughly every 25 m moved — fine enough to capture turns, coarse
// enough to be easy on the battery.
const DISTANCE_INTERVAL_M = 25;
// Batch radio wake-ups: the OS may hold points up to this long before delivering.
const DEFERRED_INTERVAL_MS = 12000;

// Bursts that couldn't be delivered wait here until the next one succeeds.
const PENDING_KEY = 'route_pending_bursts';
// Ceiling on what we hold. At ~25 m per point that is roughly 12 km of route —
// far more than a normal signal gap — and it bounds both the storage write and
// the catch-up upload. Past it the OLDEST points go, because the recent ones
// describe where the member is now.
const MAX_PENDING_POINTS = 500;
// A burst older than this belongs to a route that has long since ended;
// uploading it would only muddy the record.
const MAX_PENDING_AGE_MS = 6 * 60 * 60 * 1000;

interface RawLocation {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
}

interface FlushPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: string;
}

// Flips to true once we learn the batch endpoint isn't available (older server)
// so we stop paying a guaranteed-failing batch request before each fallback.
// Module-scoped: persists while the tracking session's process is alive.
let batchUnsupported = false;

/** A burst of points waiting for a working connection. */
interface PendingBurst {
  taskId?: string;
  points: FlushPoint[];
}

async function loadPending(): Promise<PendingBurst[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingBurst[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_PENDING_AGE_MS;
    return parsed.filter((b) => {
      if (!b?.points?.length) return false;
      const stamp = b.points[0].timestamp ? Date.parse(b.points[0].timestamp) : NaN;
      return Number.isNaN(stamp) || stamp >= cutoff;
    });
  } catch {
    // Unreadable or corrupt — start clean rather than fail the flush.
    return [];
  }
}

async function savePending(bursts: PendingBurst[]): Promise<void> {
  try {
    if (!bursts.length) {
      await AsyncStorage.removeItem(PENDING_KEY);
      return;
    }
    // Trim from the front — oldest points are the least useful.
    const trimmed = [...bursts];
    let total = trimmed.reduce((n, b) => n + b.points.length, 0);
    while (total > MAX_PENDING_POINTS && trimmed.length) {
      const excess = total - MAX_PENDING_POINTS;
      const first = trimmed[0];
      if (first.points.length <= excess) {
        total -= first.points.length;
        trimmed.shift();
      } else {
        first.points = first.points.slice(excess);
        total -= excess;
      }
    }
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[Route] Could not persist pending points:', err);
  }
}

/**
 * Send one burst. Returns the points still undelivered — empty means the server
 * has them.
 *
 * Prefers the single batch request; if the server doesn't have that endpoint
 * (404) it switches to per-point uploads for the rest of the session so
 * tracking keeps working against an older backend. Order is preserved
 * (sequential) to keep route distance accurate.
 */
async function sendBurst(taskId: string | undefined, points: FlushPoint[]): Promise<FlushPoint[]> {
  if (!batchUnsupported) {
    try {
      await trackingApi.updateLocationBatch({ taskId, points });
      return [];
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        // Endpoint missing — downgrade permanently and fall through.
        batchUnsupported = true;
      } else if (err instanceof ApiError && err.statusCode < 500) {
        // The server understood and refused: the task isn't EN_ROUTE any more,
        // or this member isn't on it. Retrying can only fail identically, so
        // drop the burst instead of carrying it forever.
        console.warn('[Route] Burst rejected, discarding:', err.statusCode);
        return [];
      } else {
        // Offline, timeout, or a server fault — keep the points for next time.
        console.warn('[Route] Batch flush failed, will retry:', err);
        return points;
      }
    }
  }

  const failed: FlushPoint[] = [];
  for (const p of points) {
    try {
      await trackingApi.updateLocation({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, taskId });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode < 500 && err.statusCode !== 404) {
        console.warn('[Route] Point rejected, discarding:', err.statusCode);
        continue;
      }
      failed.push(p);
    }
  }
  return failed;
}

/**
 * Upload a burst, and any earlier bursts that couldn't be delivered.
 *
 * Field members drive through tunnels, underground garages and dead zones.
 * Before this, a burst that failed was simply gone: the route drew a straight
 * line across the gap — the exact defect background tracking was built to fix,
 * reappearing wherever coverage is worst. Failed bursts are now held and sent
 * with the next successful flush.
 *
 * Never throws: the headless task cannot handle an exception.
 */
async function flushPoints(taskId: string | undefined, points: FlushPoint[]): Promise<void> {
  const queue: PendingBurst[] = [...(await loadPending()), { taskId, points }];
  const remaining: PendingBurst[] = [];

  for (let i = 0; i < queue.length; i++) {
    const left = await sendBurst(queue[i].taskId, queue[i].points);
    if (left.length) {
      // One failure means the connection is down; trying the rest would only
      // hold the radio up for nothing. Keep them all for the next burst.
      remaining.push({ taskId: queue[i].taskId, points: left }, ...queue.slice(i + 1));
      break;
    }
  }

  await savePending(remaining);
}

// ── Background task — runs in a separate JS context, no React state access ──
TaskManager.defineTask(ROUTE_TASK, async ({ data, error }: any) => {
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

  const points = locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy ?? undefined,
    timestamp: new Date(l.timestamp).toISOString(),
  }));

  // flushPoints handles batch→per-point fallback and buffers what it can't
  // deliver, and never throws, so the background task can't crash here.
  await flushPoints(taskId, points);

  // Same positions, no extra GPS: has the member reached the job site? Prompts
  // them to mark Arrived, which is the step that's easy to forget and expensive
  // to forget — see route-arrival.ts.
  await checkArrival(points);
});

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

    const alreadyRunning = await TaskManager.isTaskRegisteredAsync(ROUTE_TASK);
    if (alreadyRunning) return true;

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
      deferredUpdatesInterval: DEFERRED_INTERVAL_MS,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true, // iOS blue bar
      foregroundService: {
        notificationTitle: 'HBCField — Route tracking',
        notificationBody: 'Recording your route to the job site.',
        notificationColor: '#2563EB',
      },
    });

    return true;
  } catch (err) {
    console.error('[Route] Failed to start:', err);
    return false;
  }
}

/** Stop recording and clear the active task. */
export async function stopRouteTracking(): Promise<void> {
  try {
    const running = await TaskManager.isTaskRegisteredAsync(ROUTE_TASK);
    if (running) {
      await Location.stopLocationUpdatesAsync(ROUTE_TASK);
    }
  } catch (err) {
    console.error('[Route] Failed to stop:', err);
  } finally {
    await SecureStore.deleteItemAsync(ROUTE_TASK_KEY).catch(() => undefined);
    await clearRouteDestination();
  }
}

/** Is the background route tracker currently registered? */
export async function isRouteTrackingRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(ROUTE_TASK);
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
