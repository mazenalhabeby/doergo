import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { AttendanceStatus, GeofenceExcursion } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { attendanceApi } from '../../lib/api/attendance';
import { useExcursionSync } from '../../hooks/useExcursionSync';
import { startBackgroundHeartbeat, stopBackgroundHeartbeat } from '../../services/background-heartbeat';
import { startGeofenceForSpace, stopGeofence } from '../../services/background-geofence';
import { isAppActive, onAppStateChange } from '../../lib/app-resume';
import { useNow } from '../../hooks/use-now';
import { graceCountdown, heartbeatDue } from './time-logic';

/**
 * WHILE SOMEBODY IS ON THE CLOCK — where they are against the site, and the
 * out-of-ring workflow that follows from it (reason → approval → grace).
 *
 * Moved out of the Time tab unchanged in behaviour:
 *  • a heartbeat on focus, on clock-in, and every 5 minutes while on the clock
 *    AND in front (behind another app the background heartbeat carries it);
 *    — the heartbeat is what OPENS an excursion; the status alone never does;
 *  • background heartbeat and native geofencing re-armed on focus, because an
 *    app restart stops both while the shift keeps running;
 *  • a live countdown for an approved excursion's grace;
 *  • a server change to THIS member's excursion refreshes without a pull.
 *
 * ⚠️ THE SERVER NO LONGER CLOCKS ANYBODY OUT. `autoClockedOut` is handled
 * defensively for a very old server, and nothing else here ends a shift.
 */
export function useShiftWatch(status: AttendanceStatus | null, refresh: () => Promise<void> | void) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const clockedIn = !!status?.isClockedIn;
  const [outside, setOutside] = useState<{ metres: number } | null>(null);
  const [excursion, setExcursion] = useState<GeofenceExcursion | null>(null);
  const [reporting, setReporting] = useState(false);

  // The server's excursion rides on the status.
  useEffect(() => { setExcursion(status?.activeExcursion ?? null); }, [status?.activeExcursion]);

  /*
    ⚠️ ONE HEARTBEAT PER MOMENT. Focus and the clock-in both ask for one, and on
    a screen opened mid-shift they fire together — two GPS fixes and two
    requests for one answer.
  */
  const lastBeat = useRef(0);
  const heartbeat = useCallback(async () => {
    if (!clockedIn) { setOutside(null); setExcursion(null); return; }
    if (Date.now() - lastBeat.current < 20_000) return;
    lastBeat.current = Date.now();
    try {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (perm !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const result = await attendanceApi.heartbeat({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || undefined });
      if (result.autoClockedOut) {
        await stopBackgroundHeartbeat();
        await stopGeofence();
        await refresh();
        return;
      }
      setOutside(result.inRing ? null : { metres: result.distance });
      setExcursion(result.activeExcursion ?? null);
    } catch {
      /* a missed heartbeat is not news — the next one is five minutes away */
    }
  }, [clockedIn, refresh]);

  useFocusEffect(
    useCallback(() => {
      void heartbeat();
      if (clockedIn) {
        void startBackgroundHeartbeat();
        void startGeofenceForSpace(status?.currentEntry?.location as never);
      }
    }, [heartbeat, clockedIn, status?.currentEntry?.location]),
  );

  /*
    Every five minutes WHILE THE APP IS IN FRONT (heartbeatDue). Behind another
    app the background heartbeat and native geofencing carry the shift — the
    server gets the same calls from them — and on the way back a beat goes at
    once if one is due.
  */
  useEffect(() => {
    if (!clockedIn) return;
    void heartbeat();
    const beatIfDue = () => {
      if (heartbeatDue(lastBeat.current, Date.now(), isAppActive())) void heartbeat();
    };
    const id = setInterval(beatIfDue, 30_000);
    const off = onAppStateChange((st) => { if (st === 'active') beatIfDue(); });
    return () => { clearInterval(id); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockedIn]);

  // The grace countdown: a one-second clock only while one runs, paused in the background.
  const graceRunning = excursion?.status === 'APPROVED' && !!excursion.expiresAt;
  const nowMs = useNow(1000, graceRunning);
  const countdown = graceRunning ? graceCountdown(new Date(excursion!.expiresAt!).getTime(), nowMs) : '';

  useExcursionSync(useCallback(() => { void refresh(); }, [refresh]), user?.id);

  /** OUT_UNREPORTED → PENDING: a reason, and how long they will be outside. */
  const reportExcursion = useCallback(async (reason: string, minutes: number): Promise<boolean> => {
    setReporting(true);
    try {
      setExcursion(await attendanceApi.reportExcursion(reason, minutes));
      toast.success(t('attendance.outOfRing.submittedTitle'), t('attendance.outOfRing.submittedBody'));
      return true;
    } catch (e: unknown) {
      toast.error(t('common.error'), (e as Error)?.message || t('attendance.outOfRing.submitError'));
      return false;
    } finally {
      setReporting(false);
    }
  }, [toast, t]);

  return { outside, excursion, countdown, reporting, reportExcursion };
}
