import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import type { CompanyLocation } from '../lib/api';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { startBackgroundHeartbeat } from '../services/background-heartbeat';
import { startGeofenceForSpace } from '../services/background-geofence';
import { haversineDistance } from '../lib/utils';
import { mayClockInRemotely } from '@hbcfield/shared/client';
import { connectivity } from '../offline/offline-context';
import { useShiftActions } from '../offline/attendance/use-shift';
import { checkClockInLocally } from '../offline/attendance/clock-in-check';

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
  /** When the fix was taken — the server checks it matches the tap. */
  fixAt: string;
  /** Android reports a position produced by a mock-location app. */
  mocked?: boolean;
}

function coordsOf(loc: Location.LocationObject): Coords {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy || 0,
    fixAt: new Date(loc.timestamp).toISOString(),
    mocked: loc.mocked,
  };
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
  /** Already clocked in, as far as this phone knows — offline this is the only check there is. */
  isClockedIn?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const actions = useShiftActions();

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
      const coords = coordsOf(loc);
      setCurrentLocation(coords);
      setIsGettingLocation(false);
      return coords;
    } catch {
      // Fresh fix failed — fall back to last known (avoid Null Island). (mobile-H13)
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          // Carries its OWN time: an old last-known position is not evidence of
          // where this tap happened, and both the phone and the server say so.
          const coords = coordsOf(last);
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
      /*
        With no connection the phone is the only one who can answer, so it asks
        the same rules the server will — and a refusal here is the refusal the
        member would have had online. With a connection the server answers.
      */
      if (connectivity.state !== 'online') {
        const verdict = checkClockInLocally({
          location: isRemoteSelected ? null : selectedLocation,
          fix: currentLocation,
          alreadyClockedIn: !!opts.isClockedIn,
        });
        if (!verdict.ok) {
          toast.error(
            t('attendance.offline.notHere', 'Not clocked in'),
            t(`attendance.offline.refused.${verdict.code}`, {
              distance: verdict.distanceM ?? '?',
              radius: verdict.radiusM ?? '?',
              location: selectedLocation?.name ?? '',
              hours: verdict.hours ?? '',
            }),
          );
          return;
        }
      }

      const outcome = await actions.clockIn({
        ...(isRemoteSelected ? { isRemote: true } : { locationId: selectedLocation!.id }),
        fix: currentLocation,
      });
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('attendance.failedToClockIn'));
        return;
      }
      await startBackgroundHeartbeat();
      // Best-performance out-of-ring detection: monitor the space's ring natively
      // so the OS wakes us on exit even when the app is killed (skips for remote
      // or logical spaces with no coordinates). Runs after the heartbeat grants
      // the "Always" permission geofencing also needs.
      if (!isRemoteSelected) await startGeofenceForSpace(selectedLocation);
      await onClockedInRef.current?.();
      if (outcome.kind === 'queued') {
        toast.info(t('attendance.offline.clockedInSaved', 'Clocked in · saved on this phone'), t('attendance.offline.clockedInSavedBody', 'Recorded with the time and your location. It is sent when you are back online.'));
      } else {
        toast.success(
          t('common.success'),
          isRemoteSelected
            ? t('attendance.clockedInRemotely', 'Clocked in remotely')
            : t('attendance.clockedInAt', { location: selectedLocation!.name }),
        );
      }
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.failedToClockIn'));
    } finally {
      setIsClockingIn(false);
      setSelectedLocation(null);
      setIsRemoteSelected(false);
    }
  }, [currentLocation, selectedLocation, isRemoteSelected, opts.isClockedIn, actions, t, toast]);

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

  const awayCapable = (opts.assignedLocations ?? []).filter((l) => l.awayAllowed);
  const mayClockInAway =
    mayClockInRemotely(user) &&
    (awayCapable.length > 0 || (opts.assignedLocations ?? []).length === 0);

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
    /*
      Offer "Remote" only where it could be used.

      This asked the ACCOUNT alone, so a member granted it whose every workspace
      requires presence saw an option that could only ever refuse them. The
      workspace half is answered per site by the server as `awayAllowed`; the
      bucket remains for somebody assigned to no workspace at all.
    */
    allowRemote: mayClockInAway,
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
