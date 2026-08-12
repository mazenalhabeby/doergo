import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { attendanceApi } from '../lib/api';
import { getAccessToken } from '../lib/api/client';

/**
 * Native OS geofencing for out-of-ring detection.
 *
 * This is the high-performance path: instead of polling GPS every 50 m / 5 min
 * (battery-heavy, laggy, and dead when the phone is idle in a pocket), the OS
 * hardware-monitors a circular region around the clocked-in space and wakes the
 * app the moment the worker crosses the boundary — even when the app is fully
 * terminated — at near-zero battery cost.
 *
 * The geofence is only a WAKE TRIGGER: on enter/exit we send a normal heartbeat
 * with the current position, and the SERVER makes the precise in/out decision
 * (real radius + hysteresis) and drives the excursion state machine + push. The
 * periodic background heartbeat stays on as a backup and to re-check an APPROVED
 * grace timer's expiry (geofencing only fires on boundary crossings).
 */

const GEOFENCE_TASK = 'ATTENDANCE_GEOFENCE';

// OS geofences below ~50 m are unreliable; floor the monitored radius. The server
// still decides true in/out from the actual space radius on the heartbeat.
const MIN_OS_RADIUS_M = 50;

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[Geofence] task error:', error);
    return;
  }
  const eventType: number | undefined = data?.eventType;
  if (eventType == null) return;

  // Keep alive across transient keychain read failures; stop only on real logout.
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch {
    return;
  }
  if (!token) {
    await stopGeofence();
    return;
  }

  // The geofence event carries the region, not the device position — grab a fast
  // last-known fix (fall back to a fresh one) so the server can decide in/out.
  let pos = await Location.getLastKnownPositionAsync().catch(() => null);
  if (!pos) {
    pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  }
  if (!pos) return;

  try {
    await attendanceApi.heartbeat({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy || undefined,
    });
  } catch (err) {
    console.error('[Geofence] heartbeat failed:', err);
  }
});

type GeofenceSpace = { id: string; lat?: number | null; lng?: number | null; geofenceRadius?: number | null };

/**
 * Start (or restart) geofencing around the clocked-in space's ring. No-op for a
 * logical space with no coordinates. Requires background ("Always") location —
 * the caller ensures that (startBackgroundHeartbeat already requests it).
 */
export async function startGeofenceForSpace(space: GeofenceSpace | null | undefined): Promise<boolean> {
  try {
    if (!space || space.lat == null || space.lng == null) {
      // No physical ring → nothing to monitor.
      await stopGeofence();
      return false;
    }

    // Background permission is required for geofencing.
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[Geofence] background permission not granted; skipping');
      return false;
    }

    const radius = Math.max(space.geofenceRadius ?? MIN_OS_RADIUS_M, MIN_OS_RADIUS_M);

    // If already monitoring this exact region, leave it (avoid churn).
    const running = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (running) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
    }

    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: space.id,
        latitude: space.lat,
        longitude: space.lng,
        radius,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
    console.log(`[Geofence] monitoring ${space.id} r=${radius}m`);
    return true;
  } catch (err) {
    console.error('[Geofence] failed to start:', err);
    return false;
  }
}

export async function stopGeofence(): Promise<void> {
  try {
    const running = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (running) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
      console.log('[Geofence] stopped');
    }
  } catch (err) {
    console.error('[Geofence] failed to stop:', err);
  }
}

export async function isGeofenceRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}
