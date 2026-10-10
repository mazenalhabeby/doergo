import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLocationTracking, type RouteDestinationInput } from '../hooks/useLocationTracking';

interface LocationTrackingContextType {
  isTracking: boolean;
  activeTaskId: string | null;
  lastLocation: { lat: number; lng: number; accuracy?: number } | null;
  error: string | null;
  startTracking: (taskId: string, destination?: RouteDestinationInput) => Promise<boolean | undefined>;
  stopTracking: () => void;
}

const LocationTrackingContext = createContext<LocationTrackingContextType>({
  isTracking: false,
  activeTaskId: null,
  lastLocation: null,
  error: null,
  startTracking: async () => false,
  stopTracking: () => {},
});

export function LocationTrackingProvider({ children }: { children: ReactNode }) {
  const { isTracking, activeTaskId, lastLocation, error, startTracking, stopTracking } = useLocationTracking();
  // ⚠️ Stable: rebuilt only when one of these changes, not on every render of the app layout.
  const value = useMemo(
    () => ({ isTracking, activeTaskId, lastLocation, error, startTracking, stopTracking }),
    [isTracking, activeTaskId, lastLocation, error, startTracking, stopTracking],
  );

  return (
    <LocationTrackingContext.Provider value={value}>
      {children}
    </LocationTrackingContext.Provider>
  );
}

export const useLocationTrackingContext = () => useContext(LocationTrackingContext);
