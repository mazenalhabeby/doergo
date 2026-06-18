import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { trackingApi } from '../lib/api';
import {
  startRouteTracking,
  stopRouteTracking,
  isRouteTrackingRunning,
  getActiveRouteTaskId,
} from '../services/background-route-tracking';

const LOCATION_TIMEOUT_MS = 10000; // 10 second timeout for one-shot GPS fixes

interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface LocationTrackingState {
  isTracking: boolean;
  activeTaskId: string | null;
  lastLocation: LocationData | null;
  error: string | null;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
}

/**
 * Route tracking hook.
 *
 * Continuous capture now runs in a background TaskManager task (see
 * `background-route-tracking.ts`), so the member's full path is recorded even
 * with the screen off. This hook is the thin React-facing controller: it starts
 * / stops that background task, seeds an immediate first point, and exposes the
 * same surface the screens already use. One-shot helpers (clock-in / geofence)
 * stay foreground-only.
 */
export function useLocationTracking() {
  const [state, setState] = useState<LocationTrackingState>({
    isTracking: false,
    activeTaskId: null,
    lastLocation: null,
    error: null,
    permissionStatus: 'undetermined',
  });

  const taskIdRef = useRef<string | null>(null);

  // On mount: sync with any background tracking already running (e.g. the user
  // navigated away and back, or relaunched mid-route).
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      const running = await isRouteTrackingRunning();
      const activeTaskId = running ? await getActiveRouteTaskId() : null;
      taskIdRef.current = activeTaskId;
      setState((prev) => ({
        ...prev,
        permissionStatus: status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined',
        isTracking: running,
        activeTaskId,
      }));
    })();
  }, []);

  // One-shot foreground fix → also seeds lastLocation and sends an immediate
  // point so the route starts the instant the member taps "Start Driving".
  const sendLocationUpdate = useCallback(async () => {
    try {
      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Location request timed out')), LOCATION_TIMEOUT_MS),
        ),
      ]);

      const { latitude: lat, longitude: lng } = location.coords;
      const accuracy = location.coords.accuracy ?? undefined;

      await trackingApi.updateLocation({ lat, lng, accuracy, taskId: taskIdRef.current ?? undefined });

      setState((prev) => ({ ...prev, lastLocation: { lat, lng, accuracy }, error: null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update location';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, []);

  const startTracking = useCallback(async (taskId: string) => {
    // Already tracking — just re-point at the (possibly different) task.
    taskIdRef.current = taskId;

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      setState((prev) => ({ ...prev, error: 'Location permission denied', permissionStatus: 'denied' }));
      return false;
    }
    setState((prev) => ({ ...prev, permissionStatus: 'granted', isTracking: true, activeTaskId: taskId, error: null }));

    // Seed the route with an immediate point (don't wait for the first 25m).
    await sendLocationUpdate();

    // Hand off continuous capture to the background task.
    const ok = await startRouteTracking(taskId);
    if (!ok) {
      setState((prev) => ({ ...prev, error: 'Could not start background tracking' }));
    }
    return ok;
  }, [sendLocationUpdate]);

  const stopTracking = useCallback(() => {
    taskIdRef.current = null;
    setState((prev) => ({ ...prev, isTracking: false, activeTaskId: null }));
    // Fire-and-forget; the screen doesn't need to await teardown.
    stopRouteTracking();
  }, []);

  // One-time high-accuracy location for actions (clock in/out, geofence check).
  // Does NOT start continuous tracking — single GPS fix then stops.
  const getOnDemandLocation = useCallback(async (): Promise<LocationData | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GPS timeout')), LOCATION_TIMEOUT_MS),
        ),
      ]);

      return {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      };
    } catch {
      return null;
    }
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
    refreshLocation: sendLocationUpdate,
    getOnDemandLocation,
  };
}
