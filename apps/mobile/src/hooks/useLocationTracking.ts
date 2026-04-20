import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { trackingApi } from '../lib/api';

const UPDATE_INTERVAL_MS = 15000; // 15 seconds — more points for accurate route
const LOCATION_TIMEOUT_MS = 10000; // 10 second timeout for GPS

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

export function useLocationTracking() {
  const [state, setState] = useState<LocationTrackingState>({
    isTracking: false,
    activeTaskId: null,
    lastLocation: null,
    error: null,
    permissionStatus: 'undetermined',
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskIdRef = useRef<string | null>(null);

  // Check permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      setState((prev) => ({
        ...prev,
        permissionStatus: status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined',
      }));
    })();
  }, []);

  const sendLocationUpdate = useCallback(async () => {
    try {
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Location request timed out')), LOCATION_TIMEOUT_MS),
        ),
      ]);

      const { latitude: lat, longitude: lng } = location.coords;
      const accuracy = location.coords.accuracy ?? undefined;

      await trackingApi.updateLocation({
        lat,
        lng,
        accuracy,
        taskId: taskIdRef.current ?? undefined,
      });

      setState((prev) => ({
        ...prev,
        lastLocation: { lat, lng, accuracy },
        error: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update location';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, []);

  const startTracking = useCallback(async (taskId: string) => {
    // Prevent duplicate intervals
    if (intervalRef.current) {
      // Update taskId if tracking is already active for a different task
      taskIdRef.current = taskId;
      setState((prev) => ({ ...prev, activeTaskId: taskId }));
      return true;
    }

    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        setState((prev) => ({ ...prev, error: 'Location permission denied', permissionStatus: 'denied' }));
        return false;
      }

      setState((prev) => ({ ...prev, permissionStatus: 'granted' }));

      // Request background permission for continuous tracking
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

      taskIdRef.current = taskId;
      setState((prev) => ({ ...prev, isTracking: true, activeTaskId: taskId, error: null }));

      // Send initial location immediately
      await sendLocationUpdate();

      // Start periodic updates
      intervalRef.current = setInterval(sendLocationUpdate, UPDATE_INTERVAL_MS);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start tracking';
      setState((prev) => ({ ...prev, error: message }));
      return false;
    }
  }, [sendLocationUpdate]);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    taskIdRef.current = null;
    setState((prev) => ({ ...prev, isTracking: false, activeTaskId: null }));
  }, []);

  // Resume tracking when app returns to foreground (setInterval pauses in background)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && taskIdRef.current && !intervalRef.current) {
        // App came back to foreground — restart interval and send immediate update
        sendLocationUpdate();
        intervalRef.current = setInterval(sendLocationUpdate, UPDATE_INTERVAL_MS);
      } else if (nextState === 'background' && intervalRef.current) {
        // App going to background — clear interval (it won't fire anyway)
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        // Send one last location update before backgrounding
        sendLocationUpdate();
      }
    });

    return () => sub.remove();
  }, [sendLocationUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
    refreshLocation: sendLocationUpdate,
  };
}
