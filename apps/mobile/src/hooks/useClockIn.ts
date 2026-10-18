import { useState, useCallback, useMemo, useRef } from 'react';
import type * as Location from 'expo-location';
import { evidenceFix, getFix } from '../lib/location-fix';
import { useTranslation } from 'react-i18next';
import type { CompanyLocation } from '../lib/api';
import { clockableLocations } from '../lib/clockable';
import { useAuth } from '../contexts/auth-context';
import { useIsland, useToast } from '../island/island-context';
import { isAwayRefusal, preferShiftWorkspace } from '../lib/clock-smart';
import { useAskToWorkHere } from './use-ask-to-work-here';
import { startBackgroundHeartbeat } from '../services/background-heartbeat';
import { startGeofenceForSpace } from '../services/background-geofence';
import {
  chooseClockInLocation,
  haversineDistance,
  mayClockInRemotely,
  parseClockInPick,
} from '@hbcfield/shared/client';
import { connectivity } from '../offline/offline-context';
import { useShiftActions } from '../offline/attendance/use-shift';
import { checkClockInLocally } from '../offline/attendance/clock-in-check';
import { formatDistance, refusalText } from '../lib/distance';

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
  /** When the fix was taken — the server checks it matches the tap. */
  fixAt: string;
  /** Android reports a position produced by a mock-location app. */
  mocked?: boolean;
}

const coordsOf = (loc: Location.LocationObject): Coords => evidenceFix(loc);

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
  /** Today's planned shift names this workspace — taken without a picker (lib/clock-smart.ts). */
  shiftSpaceId?: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const island = useIsland();
  const askToWorkHere = useAskToWorkHere();
  const actions = useShiftActions();

  /*
    A refusal for being away from the site is no dead end: it offers the
    request that would let this clock-in through (a REMOTE day here, today).
  */
  const refuse = useCallback(
    (title: string, body: string, code: string | null | undefined, location: CompanyLocation | null) => {
      if (!location || !isAwayRefusal(code)) { toast.error(title, body); return; }
      island.say({
        tone: 'failed', title, body,
        action: { label: t('clockSmart.askFromHere'), onPress: () => void askToWorkHere({ id: location.id, name: location.name }) },
      });
    },
    [toast, island, t, askToWorkHere],
  );

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
      /*
        A fresh, accurate fix — and when none comes in time, the last position
        the OS knows rather than none (avoid Null Island, mobile-H13). That one
        carries its OWN time: an old last-known position is not evidence of
        where this tap happened, and both the phone and the server say so.
      */
      const coords = coordsOf(await getFix({ purpose: 'evidence', ask: true, orLastKnown: true }));
      setCurrentLocation(coords);
      return coords;
    } catch {
      toast.warning(t('attendance.locationRequired'), t('attendance.enableLocationServices'));
      return null;
    } finally {
      setIsGettingLocation(false);
    }
  }, [t, toast]);

  /*
    Clock in at a workspace — or, with `null`, the org's Remote bucket for
    somebody who has no workspace at all. The one path every tap ends in.
  */
  const clockInAt = useCallback(
    async (location: CompanyLocation | null, fix: Coords) => {
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
            refuse(
              t('attendance.offline.notHere', 'Not clocked in'),
              t(`attendance.offline.refused.${verdict.code}`, {
                distance: formatDistance(verdict.distanceM),
                radius: formatDistance(verdict.radiusM),
                location: location?.name ?? '',
                hours: verdict.hours ?? '',
              }),
              verdict.code,
              location,
            );
            return;
          }
        }

        const outcome = await actions.clockIn({
          ...(location ? { locationId: location.id } : { isRemote: true }),
          fix,
        });
        if (outcome.kind === 'refused') {
          refuse(t('common.error'), refusalText(t, outcome, t('attendance.failedToClockIn')), outcome.code, location);
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
          toast.info(
            t('attendance.offline.clockedInSaved', 'Clocked in · saved on this phone'),
            t(
              'attendance.offline.clockedInSavedBody',
              'Recorded with the time and your location. It is sent when you are back ' + 'online.',
            ),
          );
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
    },
    [opts.isClockedIn, actions, t, toast, refuse],
  );

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
  // Only where a clock-in would be taken now (lib/clockable.ts) — never a workspace the server refuses.
  const clockable = useMemo(() => clockableLocations(opts.assignedLocations), [opts.assignedLocations]);

  const openClockInModal = useCallback(async () => {
    if (isClockingIn) return;
    const fix = await getCurrentLocation();
    if (!fix) return;
    // The member's own choice: clock in where they stand, or always choose (Profile › Clock in).
    const pick = parseClockInPick(user?.clockInPick);
    const choice = preferShiftWorkspace(chooseClockInLocation(clockable, fix, pick), opts.shiftSpaceId, pick);
    if (choice.kind === 'auto') {
      await clockInAt(choice.location, fix);
      return;
    }
    if (choice.kind === 'none') {
      if (mayClockInRemotely(user)) await clockInAt(null, fix);
      else
        toast.error(
          t('common.error'),
          t(
            'attendance.noAssignedLocations',
            'You are not assigned to a workspace yet. Ask your admin to add you to ' + 'one.',
          ),
        );
      return;
    }
    setSelectedLocation(choice.ranked[0]!.location);
    setLocationModalVisible(true);
  }, [isClockingIn, getCurrentLocation, clockable, clockInAt, user, t, toast, opts.shiftSpaceId]);

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
    locations: clockable,
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
