import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { attendanceApi } from '../lib/api';
import { getAccessToken } from '../lib/api/client';
import { requestBackgroundLocationConsent } from './location-consent';
import { keptCheckIns } from './kept-check-ins';
import { isUnreachable } from '../offline/actions/unreachable';
import i18n from '../i18n';

const TASK_NAME = 'ATTENDANCE_HEARTBEAT';

interface RawFix {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp?: number;
}

/**
 * The fix to report from one delivery: the NEWEST.
 *
 * ⚠️ Deliveries are deferred (up to fifteen minutes), so one wake-up can carry
 * a quarter of an hour of fixes, oldest first. Reporting `locations[0]` told
 * the server where the member was at the START of that window — somebody who
 * had already walked off the site read as still on it until the next batch.
 */
export function newestFix<T extends RawFix>(locations: readonly T[] | null | undefined): T | null {
  if (!locations?.length) return null;
  let best = locations[0]!;
  for (const l of locations) {
    if ((l.timestamp ?? 0) >= (best.timestamp ?? 0)) best = l;
  }
  return best;
}

// Define the background task
TaskManager.defineTask(TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('[Heartbeat] Background task error:', error);
    return;
  }

  if (!data?.locations?.length) return;

  // Stop only on a genuine logout (token absent). A transient keychain read
  // error must NOT deregister the heartbeat. (Sec audit H12.)
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch {
    return; // transient read failure — skip this tick, keep the heartbeat alive
  }
  if (!token) {
    console.log('[Heartbeat] No auth token, stopping background tracking');
    await stopBackgroundHeartbeat();
    return;
  }

  const location = newestFix<RawFix>(data.locations);
  if (!location) return;
  const point = {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy || undefined,
    recordedAt: new Date(location.timestamp ?? Date.now()).toISOString(),
  };
  // What was kept without signal goes first, so the live check-in is judged after it.
  if (!(await keptCheckIns.flush().catch(() => false))) {
    await keptCheckIns.keep(point);
    return;
  }
  try {
    const result = await attendanceApi.heartbeat({ lat: point.lat, lng: point.lng, accuracy: point.accuracy });

    if (result.autoClockedOut) {
      console.log('[Heartbeat] Auto-clocked out by server, stopping background tracking');
      await stopBackgroundHeartbeat();
    }
  } catch (err) {
    if (isUnreachable(err)) {
      await keptCheckIns.keep(point);
      return;
    }
    console.error('[Heartbeat] Failed to send heartbeat:', err);
  }
});

/**
 * Start background location tracking for attendance heartbeat.
 * Call this after successful clock-in.
 */
export async function startBackgroundHeartbeat(): Promise<boolean> {
  try {
    /*
      ⚠️ STARTED, NOT MERELY REGISTERED — the route tracker's rule. A task stays
      registered after the OS stops its location updates (a force-stop, a
      battery saver, an app update), so "registered" returned "already running"
      for a heartbeat that was sending nothing, for the rest of the shift.
    */
    const isRunning = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (isRunning) {
      console.log('[Heartbeat] Already running');
      return true;
    }

    // Google Play: show the prominent in-app disclosure BEFORE requesting the OS
    // background-location permission. Attendance heartbeat needs background
    // location, so decline means we don't start.
    const consented = await requestBackgroundLocationConsent();
    if (!consented) {
      console.log('[Heartbeat] Background location disclosure declined');
      return false;
    }

    // Request background location permission
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[Heartbeat] Background location permission denied');
      return false;
    }

    // Native geofencing (background-geofence.ts) is now the PRIMARY out-of-ring
    // detector — the OS wakes us instantly on a ring crossing at ~zero battery.
    // So this continuous poll is trimmed to a light safety net: it only reconciles
    // state if a geofence event is ever missed and re-checks an APPROVED grace
    // timer's expiry (geofences fire on crossings, not on "time's up"). Stretching
    // the interval + distance cuts battery substantially with no loss of the
    // instant crossing detection geofencing provides.
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15 * 60 * 1000,      // Safety-net poll every 15 min (was 5)
      distanceInterval: 150,             // Or every 150 m moved (was 50)
      deferredUpdatesInterval: 15 * 60 * 1000,
      pausesUpdatesAutomatically: true,  // iOS: let the OS pause when stationary
      activityType: Location.ActivityType.Other,
      showsBackgroundLocationIndicator: true, // iOS blue bar
      // In the member's language — it stays on their lock screen for the whole shift.
      foregroundService: {
        notificationTitle: i18n.t('tracking.foreground.shiftTitle'),
        notificationBody: i18n.t('tracking.foreground.shiftBody'),
        notificationColor: '#059669',
      },
    });

    console.log('[Heartbeat] Background tracking started');
    return true;
  } catch (err) {
    console.error('[Heartbeat] Failed to start:', err);
    return false;
  }
}

/**
 * Stop background location tracking.
 * Call this after clock-out.
 */
export async function stopBackgroundHeartbeat(): Promise<void> {
  try {
    const isRunning = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
      console.log('[Heartbeat] Background tracking stopped');
    }
  } catch (err) {
    console.error('[Heartbeat] Failed to stop:', err);
  }
}
