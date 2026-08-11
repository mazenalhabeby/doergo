import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { trackingApi, ApiError } from '../lib/api';
import { getAccessToken } from '../lib/api/client';
import { requestBackgroundLocationConsent } from './location-consent';

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

/**
 * Upload a burst of points. Prefers the single batch request; if the server
 * doesn't have that endpoint yet (404), or the batch call fails, falls back to
 * sequential per-point uploads so tracking keeps working against an older
 * backend. Per-point order is preserved (sequential) to keep route distance
 * accurate.
 */
async function flushPoints(taskId: string | undefined, points: FlushPoint[]): Promise<void> {
  if (!batchUnsupported) {
    try {
      await trackingApi.updateLocationBatch({ taskId, points });
      return;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        // Endpoint missing — switch to per-point for the rest of the session.
        batchUnsupported = true;
      } else {
        // Transient failure (network/timeout). Don't permanently downgrade;
        // still try per-point now as a best-effort for this burst.
        console.warn('[Route] Batch flush failed, trying per-point:', err);
      }
    }
  }

  // Fallback: one request per point, in capture order.
  for (const p of points) {
    try {
      await trackingApi.updateLocation({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, taskId });
    } catch (err) {
      console.warn('[Route] Per-point upload failed:', err);
    }
  }
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

  // Best-effort: dropped points just thin the route slightly; the next burst
  // will continue it. flushPoints handles batch→per-point fallback internally
  // and never throws, so the background task can't crash here.
  await flushPoints(taskId, points);
});

/**
 * Start recording the member's route for a task. Idempotent — if already
 * running, it just re-points tracking at the new task id.
 */
export async function startRouteTracking(taskId: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(ROUTE_TASK_KEY, taskId);

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
