import { createContext, useContext, type ReactNode } from 'react';
import { useLocationTracking } from '../hooks/useLocationTracking';

interface LocationTrackingContextType {
  isTracking: boolean;
  activeTaskId: string | null;
  lastLocation: { lat: number; lng: number; accuracy?: number } | null;
  error: string | null;
  startTracking: (taskId: string) => Promise<boolean | undefined>;
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
  const tracking = useLocationTracking();

  return (
    <LocationTrackingContext.Provider
      value={{
        isTracking: tracking.isTracking,
        activeTaskId: tracking.activeTaskId,
        lastLocation: tracking.lastLocation,
        error: tracking.error,
        startTracking: tracking.startTracking,
        stopTracking: tracking.stopTracking,
      }}
    >
      {children}
    </LocationTrackingContext.Provider>
  );
}

export const useLocationTrackingContext = () => useContext(LocationTrackingContext);
