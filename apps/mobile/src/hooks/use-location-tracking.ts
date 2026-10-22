import { useState, useEffect, useCallback, useRef } from 'react';
import { onAppResume } from '../lib/app-resume';
import * as Location from 'expo-location';
import { fixPoint, getFix } from '../lib/location-fix';
import { trackingApi, tasksApi, ApiError } from '../lib/api';
import {
  startRouteTracking,
  stopRouteTracking,
  isRouteTrackingRunning,
  getActiveRouteTaskId,
} from '../services/background-route-tracking';

interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** Where this route is headed — powers the "you've arrived" prompt. */
export interface RouteDestinationInput {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
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

  // Sync with any background tracking already running (the member navigated
  // away and back, or relaunched mid-route) — and stop it if it has outlived
  // the route it belongs to.
  //
  // The background task survives the app being killed, by design. But it is
  // only ever stopped from inside the app, so any path that ends a route
  // without passing through this hook — the task completed from the web, a
  // dispatcher reassigning it, a crash between ARRIVED and the stop call —
  // leaves GPS running indefinitely on the member's phone. It records nothing
  // usable (the server refuses points for a task that isn't EN_ROUTE) and
  // drains the battery until the next reboot. So on every foreground, check the
  // task the tracker is attributing points to and shut it down if that task has
  // moved on.
  const reconcile = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const permissionStatus =
      status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : ('undetermined' as const);

    let running = await isRouteTrackingRunning();
    let activeTaskId = running ? await getActiveRouteTaskId() : null;

    if (running) {
      let stale = !activeTaskId; // tracking with no task to attribute points to
      if (activeTaskId) {
        try {
          const task = await tasksApi.getById(activeTaskId);
          stale = task.status !== 'EN_ROUTE';
        } catch (err) {
          // Only a definitive "this task is gone" ends tracking. A network
          // failure must not, or driving through a dead zone would stop the
          // recording this whole system exists to keep.
          if (err instanceof ApiError && (err.statusCode === 404 || err.statusCode === 403)) {
            stale = true;
          }
        }
      }
      if (stale) {
        await stopRouteTracking();
        running = false;
        activeTaskId = null;
      }
    }

    taskIdRef.current = activeTaskId;
    setState((prev) => ({ ...prev, permissionStatus, isTracking: running, activeTaskId }));
  }, []);

  useEffect(() => {
    void reconcile();
    return onAppResume(() => void reconcile());
  }, [reconcile]);

  // One-shot foreground fix → also seeds lastLocation and sends an immediate
  // point so the route starts the instant the member taps "Start Driving".
  const sendLocationUpdate = useCallback(async () => {
    try {
      // Permission was asked by startTracking, the only caller.
      const { lat, lng, accuracy } = fixPoint(await getFix({ purpose: 'evidence' }));

      await trackingApi.updateLocation({ lat, lng, accuracy, taskId: taskIdRef.current ?? undefined });

      setState((prev) => ({ ...prev, lastLocation: { lat, lng, accuracy }, error: null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update location';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, []);

  const startTracking = useCallback(async (taskId: string, destination?: RouteDestinationInput) => {
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

    // Hand off continuous capture to the background task. The destination goes
    // with it so arrival can be recognised from points already being recorded.
    const ok = await startRouteTracking(taskId, destination);
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

  return {
    ...state,
    startTracking,
    stopTracking,
  };
}
