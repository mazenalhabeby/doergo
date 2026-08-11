import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { attendanceApi, CompanyLocation } from '../lib/api';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { startBackgroundHeartbeat } from '../services/background-heartbeat';
import { haversineDistance } from '../lib/utils';

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Single source of truth for the mobile clock-in flow — GPS acquisition, the
 * location/remote picker, and the clock-in call. Used by the attendance tab AND
 * both home screens so the "Work remotely" choice (for allowRemote members) is
 * identical everywhere instead of duplicated three times. Spread `pickerProps`
 * straight into <LocationPickerSheet/>, wire the button to `openClockInModal`,
 * and pass an `onClockedIn` callback to refetch that screen's attendance data.
 */
export function useClockIn(opts: {
  assignedLocations: CompanyLocation[];
  onClockedIn?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();

  // Keep the latest refetch callback without churning the memoised handlers.
  const onClockedInRef = useRef(opts.onClockedIn);
  onClockedInRef.current = opts.onClockedIn;

  const [currentLocation, setCurrentLocation] = useState<Coords | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<CompanyLocation | null>(null);
  const [isRemoteSelected, setIsRemoteSelected] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isClockingIn, setIsClockingIn] = useState(false);

  const getCurrentLocation = useCallback(async (): Promise<Coords | null> => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.warning(t('attendance.locationRequired'), t('attendance.enableLocationServices'));
        setIsGettingLocation(false);
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords: Coords = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy || 0,
      };
      setCurrentLocation(coords);
      setIsGettingLocation(false);
      return coords;
    } catch {
      // Fresh fix failed — fall back to last known (avoid Null Island). (mobile-H13)
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coords: Coords = {
            lat: last.coords.latitude,
            lng: last.coords.longitude,
            accuracy: last.coords.accuracy || 0,
          };
          setCurrentLocation(coords);
          setIsGettingLocation(false);
          return coords;
        }
      } catch {
        /* fall through */
      }
      toast.warning(t('attendance.locationRequired'), t('attendance.enableLocationServices'));
      setIsGettingLocation(false);
      return null;
    }
  }, [t, toast]);

  // Acquire GPS then open the picker (locations + a Remote option when eligible).
  const openClockInModal = useCallback(async () => {
    const loc = await getCurrentLocation();
    if (!loc) return;
    setLocationModalVisible(true);
  }, [getCurrentLocation]);

  const confirmClockIn = useCallback(async () => {
    if (!currentLocation || (!selectedLocation && !isRemoteSelected)) return;
    setIsClockingIn(true);
    setLocationModalVisible(false);
    try {
      await attendanceApi.clockIn(
        isRemoteSelected
          ? {
              isRemote: true,
              lat: currentLocation.lat,
              lng: currentLocation.lng,
              accuracy: currentLocation.accuracy,
            }
          : {
              locationId: selectedLocation!.id,
              lat: currentLocation.lat,
              lng: currentLocation.lng,
              accuracy: currentLocation.accuracy,
            },
      );
      await startBackgroundHeartbeat();
      await onClockedInRef.current?.();
      toast.success(
        t('common.success'),
        isRemoteSelected
          ? t('attendance.clockedInRemotely', 'Clocked in remotely')
          : t('attendance.clockedInAt', { location: selectedLocation!.name }),
      );
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.failedToClockIn'));
    } finally {
      setIsClockingIn(false);
      setSelectedLocation(null);
      setIsRemoteSelected(false);
    }
  }, [currentLocation, selectedLocation, isRemoteSelected, t, toast]);

  const getDistanceToLocation = useCallback(
    (location: CompanyLocation): number | null => {
      if (!currentLocation) return null;
      // A logical space (no map location set) has no coordinates → no geofence,
      // no meaningful distance. Guard so we never render a garbage "away 8901km".
      if (location.lat == null || location.lng == null) return null;
      return haversineDistance(currentLocation.lat, currentLocation.lng, location.lat, location.lng);
    },
    [currentLocation],
  );

  // Spread straight into <LocationPickerSheet {...pickerProps} />.
  const pickerProps = {
    visible: locationModalVisible,
    locations: opts.assignedLocations,
    selectedLocation,
    onSelect: (loc: CompanyLocation) => {
      setSelectedLocation(loc);
      setIsRemoteSelected(false);
    },
    onConfirm: confirmClockIn,
    onClose: () => setLocationModalVisible(false),
    getDistance: getDistanceToLocation,
    allowRemote: !!user?.allowRemote,
    remoteSelected: isRemoteSelected,
    onSelectRemote: () => {
      setIsRemoteSelected(true);
      setSelectedLocation(null);
    },
  };

  return {
    openClockInModal,
    confirmClockIn,
    getCurrentLocation,
    getDistanceToLocation,
    currentLocation,
    isGettingLocation,
    isClockingIn,
    isBusy: isGettingLocation || isClockingIn,
    locationModalVisible,
    pickerProps,
  };
}
