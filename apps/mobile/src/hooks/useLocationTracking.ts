import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { trackingApi } from '../lib/api';

const UPDATE_INTERVAL_MS = 30000; // 30 seconds

interface UseLocationTrackingOptions {
  taskId?: string;
  onError?: (error: string) => void;
}

interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface LocationTrackingState {
  isTracking: boolean;
  lastLocation: LocationData | null;
  error: string | null;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
}

export function useLocationTracking(options: UseLocationTrackingOptions = {}) {
  const [state, setState] = useState<LocationTrackingState>({
    isTracking: false,
    lastLocation: null,
    error: null,
    permissionStatus: 'undetermined',
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskIdRef = useRef(options.taskId);

  // Update taskId ref when it changes
  useEffect(() => {
    taskIdRef.current = options.taskId;
  }, [options.taskId]);

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
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude: lat, longitude: lng } = location.coords;
      const accuracy = location.coords.accuracy ?? undefined;

      // Send to backend
      await trackingApi.updateLocation({
        lat,
        lng,
        accuracy,
        taskId: taskIdRef.current,
      });

      setState((prev) => ({
        ...prev,
        lastLocation: { lat, lng, accuracy },
        error: null,
      }));

      console.log('[Location] Update sent:', { lat, lng, accuracy });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update location';
      console.error('[Location] Update failed:', message);
      setState((prev) => ({ ...prev, error: message }));
      options.onError?.(message);
    }
  }, [options]);

  const startTracking = useCallback(async () => {
    try {
      // Request foreground permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        const message = 'Location permission denied';
        setState((prev) => ({ ...prev, error: message, permissionStatus: 'denied' }));
        options.onError?.(message);
        return false;
      }

      setState((prev) => ({ ...prev, permissionStatus: 'granted' }));

      // Optionally request background permissions (for when app is backgrounded)
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.warn('[Location] Background permission not granted - tracking will pause when app is backgrounded');
      }

      setState((prev) => ({ ...prev, isTracking: true, error: null }));

      // Send initial location immediately
      await sendLocationUpdate();

      // Start periodic updates
      intervalRef.current = setInterval(sendLocationUpdate, UPDATE_INTERVAL_MS);

      console.log('[Location] Tracking started');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start tracking';
      console.error('[Location] Start tracking failed:', message);
      setState((prev) => ({ ...prev, error: message }));
      options.onError?.(message);
      return false;
    }
  }, [sendLocationUpdate, options]);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((prev) => ({ ...prev, isTracking: false }));
    console.log('[Location] Tracking stopped');
  }, []);

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
