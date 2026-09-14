import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import type { CompanyLocation } from '../lib/api';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../contexts/toast-context';
import { startBackgroundHeartbeat } from '../services/background-heartbeat';
import { startGeofenceForSpace } from '../services/background-geofence';
import { haversineDistance } from '../lib/utils';
import { chooseClockInLocation, mayClockInRemotely } from '@hbcfield/shared/client';
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
 * one-button workspace choice, and the clock-in call. Used by the attendance tab
 * AND both home screens so the flow is identical everywhere. Spread `pickerProps`
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

  /*
    Clock in at a workspace — or, with `null`, the org's Remote bucket for
    somebody who has no workspace at all. The one path every tap ends in.
  */
  const clockInAt = useCallback(async (location: CompanyLocation | null, fix: Coords) => {
    setIsClockingIn(true);
    setLocationModalVisible(false);
    try {
      /*
        With no connection the phone is the only one who can answer, so it asks
        the same rules the server will — and a refusal here is the refusal the
        member would have had online. With a connection the server answers.
      */
      if (connectivity.state !== 'online') {
        const verdict = checkClockInLocally({ location, fix, alreadyClockedIn: !!opts.isClockedIn });
        if (!verdict.ok) {
          toast.error(
            t('attendance.offline.notHere', 'Not clocked in'),
            t(`attendance.offline.refused.${verdict.code}`, {
              distance: verdict.distanceM ?? '?',
              radius: verdict.radiusM ?? '?',
              location: location?.name ?? '',
              hours: verdict.hours ?? '',
            }),
          );
          return;
        }
      }

      const outcome = await actions.clockIn({ ...(location ? { locationId: location.id } : { isRemote: true }), fix });
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('attendance.failedToClockIn'));
        return;
      }
      await startBackgroundHeartbeat();
      // Best-performance out-of-ring detection: monitor the space's ring natively
      // so the OS wakes us on exit even when the app is killed (skips for remote
      // or logical spaces with no coordinates). Runs after the heartbeat grants
      // the "Always" permission geofencing also needs.
      if (location) await startGeofenceForSpace(location);
      await onClockedInRef.current?.();
      if (outcome.kind === 'queued') {
        toast.info(t('attendance.offline.clockedInSaved', 'Clocked in · saved on this phone'), t('attendance.offline.clockedInSavedBody', 'Recorded with the time and your location. It is sent when you are back online.'));
      } else {
        toast.success(
          t('common.success'),
          !location
            ? t('attendance.clockedInRemotely', 'Clocked in remotely')
            : t('attendance.clockedInAt', { location: location.name }),
        );
      }
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.failedToClockIn'));
    } finally {
      setIsClockingIn(false);
      setSelectedLocation(null);
    }
  }, [opts.isClockedIn, actions, t, toast]);

  /**
   * One button: clock in.
   *
   * Nobody is asked when the answer is obvious — one workspace, or standing
   * inside exactly one of several areas — and otherwise the sheet opens with
   * the best one already chosen. The choice is `chooseClockInLocation`, shared
   * with the web and working from what the phone saved when it has no signal.
   *
   * ⚠️ No "remote" or "field" choice for a member who has workspaces: whether
   * they may be away is the server's, and where they are working is decided
   * from evidence afterwards.
   */
  const openClockInModal = useCallback(async () => {
    if (isClockingIn) return;
    const fix = await getCurrentLocation();
    if (!fix) return;
    const choice = chooseClockInLocation(opts.assignedLocations ?? [], fix);
    if (choice.kind === 'auto') {
      await clockInAt(choice.location, fix);
      return;
    }
    if (choice.kind === 'none') {
      if (mayClockInRemotely(user)) await clockInAt(null, fix);
      else toast.error(t('common.error'), t('attendance.noAssignedLocations', 'You are not assigned to a workspace yet. Ask your admin to add you to one.'));
      return;
    }
    setSelectedLocation(choice.ranked[0]!.location);
    setLocationModalVisible(true);
  }, [isClockingIn, getCurrentLocation, opts.assignedLocations, clockInAt, user, t, toast]);

  const confirmClockIn = useCallback(async () => {
    if (!currentLocation || !selectedLocation) return;
    await clockInAt(selectedLocation, currentLocation);
  }, [currentLocation, selectedLocation, clockInAt]);

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
    onSelect: (loc: CompanyLocation) => setSelectedLocation(loc),
    onConfirm: confirmClockIn,
    onClose: () => setLocationModalVisible(false),
    fix: currentLocation,
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
