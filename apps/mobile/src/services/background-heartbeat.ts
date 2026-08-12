import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { attendanceApi } from '../lib/api';
import { getAccessToken } from '../lib/api/client';
import { requestBackgroundLocationConsent } from './location-consent';

const TASK_NAME = 'ATTENDANCE_HEARTBEAT';

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

  const location = data.locations[0];
  try {
    const result = await attendanceApi.heartbeat({
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      accuracy: location.coords.accuracy || undefined,
    });

    if (result.autoClockedOut) {
      console.log('[Heartbeat] Auto-clocked out by server, stopping background tracking');
      await stopBackgroundHeartbeat();
    }
  } catch (err) {
    console.error('[Heartbeat] Failed to send heartbeat:', err);
  }
});

/**
 * Start background location tracking for attendance heartbeat.
 * Call this after successful clock-in.
 */
export async function startBackgroundHeartbeat(): Promise<boolean> {
  try {
    // Check if already running
    const isRunning = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
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
      foregroundService: {
        notificationTitle: 'HBCField - Clocked In',
        notificationBody: 'Tracking your attendance at work location',
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

/**
 * Check if background heartbeat is currently running.
 */
export async function isHeartbeatRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  } catch {
    return false;
  }
}
