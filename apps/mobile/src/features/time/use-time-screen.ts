import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNow } from '@/hooks/use-now';
import { getFix } from '@/lib/location-fix';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { orgHasAddOn, hasAccessModule } from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { useResponsive } from '@/lib/responsive';
import { attendanceApi, overtimeApi, type OvertimeRequest, type TimeEntry } from '@/lib/api';
import { refusalText } from '@/lib/distance';
import { leaveTimeFrom } from '@/offline/attendance/leave-time';
import { useShift, useShiftActions } from '@/offline/attendance/use-shift';
import { stopBackgroundHeartbeat } from '@/services/background-heartbeat';
import { stopGeofence } from '@/services/background-geofence';
import { useTabSafe } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { scheduleFor, totalsRevision } from '../home/shift-state';
import { useScheduleTotals } from '../home/use-schedule-totals';
import { useTourScroll } from '../tour';
import { noShiftHere, placesView } from './time-logic';
import { useMyTimeOff } from './use-my-time-off';
import { useShiftWatch } from './use-shift-watch';

/** TimeScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useTimeScreen() {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const r = useResponsive();

  // The minute moves; nothing is counted up. Every figure derives from the clock.
  const nowMs = useNow(30_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  /* ---------------- the shift ---------------- */
  const shift = useShift();
  useLiveRefresh(shift.refresh, null, { onReconnect: true });
  const status = shift.status;
  const entry = status?.isClockedIn ? status.currentEntry : null;
  const actions = useShiftActions();
  const totals = useScheduleTotals({
    schedule: scheduleFor(user?.scheduleType),
    revision: totalsRevision(status, shift.pendingSync),
    // The week bars need the week whatever the schedule — and the card reads the same answer.
    enabled: true,
    userId: user?.id ?? null,
  });
  const watch = useShiftWatch(status, shift.refresh);

  // Extra-time approvals are bought (shift_scheduling) and held by people who manage users.
  const hasShiftScheduling = orgHasAddOn(user?.orgAddOns, 'shift_scheduling');
  const canApproveExtraTime = !!user?.canManageUsers && hasShiftScheduling;

  /* ---------------- recent shifts + extra time ---------------- */
  const [recent, setRecent] = useState<TimeEntry[]>([]);
  const [overtime, setOvertime] = useState<OvertimeRequest | null>(null);
  // How many requests wait on this person — only asked of somebody who can decide them.
  const [waiting, setWaiting] = useState(0);
  const loadExtras = useCallback(async () => {
    const [h, o, w] = await Promise.allSettled([
      attendanceApi.getHistory({ limit: 10 }),
      overtimeApi.getActive(),
      canApproveExtraTime ? attendanceApi.getPendingExtraTime() : Promise.resolve([]),
    ]);
    if (w.status === 'fulfilled') setWaiting(w.value.length);
    if (h.status === 'fulfilled') {
      // ⚠️ A BARE ARRAY once unwrapped — see `attendanceApi.getHistory`.
      const v = h.value as unknown;
      setRecent(Array.isArray(v) ? (v as TimeEntry[]) : ((v as { data?: TimeEntry[] })?.data ?? []));
    }
    if (o.status === 'fulfilled') setOvertime(o.value ?? null);
  }, [canApproveExtraTime]);
  useLiveRefresh(loadExtras, null);
  // A clock-out adds a shift to the history; reload it when the shift changes.
  const shiftKey = `${status?.isClockedIn ? '1' : '0'}:${status?.currentEntry?.id ?? ''}`;
  const lastKey = useRef(shiftKey);
  useEffect(() => {
    if (lastKey.current === shiftKey) return;
    lastKey.current = shiftKey;
    void loadExtras();
  }, [shiftKey, loadExtras]);

  /* ---------------- time off ---------------- */
  const timeOffOn = hasAccessModule(user || {}, 'time_off');
  const leave = useMyTimeOff(timeOffOn);
  useLiveRefresh(leave.fetchData, null);
  const [requestOpen, setRequestOpen] = useState(false);

  /* ---------------- where you work ---------------- */
  /*
    ⚠️ THE POSITION IS ASKED WITHOUT A PROMPT. A permission dialog on opening a
    tab is a question nobody asked for; clocking in is where the app asks. With
    no permission yet the tiles simply say "distance unknown".
  */
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy?: number | null } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        try {
          const p = await getFix({ purpose: 'nearby' });
          if (alive) setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        } catch {
          /* no fix — the tiles say so */
        }
      })();
      return () => { alive = false; };
    }, []),
  );
  const tiles = useMemo(
    () => placesView(status?.assignedLocations ?? [], fix, entry?.location?.id ?? entry?.locationId ?? null),
    [status?.assignedLocations, fix, entry?.location?.id, entry?.locationId],
  );

  // The one workspace whose no-shift rule the page speaks of — the one they are at — never one per workspace.
  const noShift = useMemo(() => noShiftHere(tiles, !!entry, now), [tiles, entry, now]);
  // No hours left there: ask the leader for overtime today (the Requests form, filled in).
  const askMoreTime = timeOffOn
    ? () => router.push({ pathname: '/(app)/(tabs)/time-off', params: { ask: 'OVERTIME' } } as never)
    : undefined;

  /* ---------------- answers the page owns ---------------- */
  const [busy, setBusy] = useState(false);
  const say = (o: { code?: string; message?: string; params?: Record<string, unknown> }, fallback: string) => refusalText(t, o, fallback);

  // ⑦ — a shift closed with a temporary time: when did they really leave?
  const unconfirmed = status?.unconfirmedClockOut ?? null;
  const unconfirmedTz = unconfirmed?.timezone ?? unconfirmed?.location?.timezone ?? undefined;
  const [leavePicker, setLeavePicker] = useState(false);
  /* "Clock out" on the shift-ended card bumps this; the clock card opens its receipt. */
  const [clockOutRequest, setClockOutRequest] = useState(0);
  const requestClockOut = useCallback(() => setClockOutRequest((n) => n + 1), []);
  const confirmLeaveTime = async (hhmm: string) => {
    setLeavePicker(false);
    if (!unconfirmed) return;
    const at = leaveTimeFrom(hhmm, new Date(unconfirmed.clockInAt), unconfirmedTz ?? 'UTC', new Date());
    if (!at) { toast.error(t('common.error'), t('attendance.unconfirmed.inFuture')); return; }
    setBusy(true);
    try {
      const outcome = await actions.resolveClockOut({ entryId: unconfirmed.id, clockOutAt: at });
      if (outcome.kind === 'refused') { toast.error(t('common.error'), say(outcome, t('shiftReminder.resolveFailed'))); return; }
      await shift.refresh();
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(t('common.success'), t('attendance.unconfirmed.saved'));
    } finally {
      setBusy(false);
    }
  };

  // "I forgot to clock out" — the real leave time, for the running shift.
  const resolveForgot = async (at: Date) => {
    if (!entry) return;
    setBusy(true);
    try {
      const outcome = await actions.resolveClockOut({ entryId: entry.id, clockOutAt: at });
      if (outcome.kind === 'refused') { toast.error(t('common.error'), say(outcome, t('shiftReminder.resolveFailed'))); return; }
      await stopBackgroundHeartbeat();
      await stopGeofence();
      await shift.refresh();
      toast.success(t('common.success'), t('shiftReminder.resolveSuccess'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('shiftReminder.resolveFailed'));
    } finally {
      setBusy(false);
    }
  };

  // "I'm working extra time" — routes to a leader for approval.
  const requestExtra = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      const outcome = await actions.requestExtraTime({ entryId: entry.id });
      if (outcome.kind === 'refused') { toast.error(t('common.error'), say(outcome, t('shiftReminder.extraRequestFailed'))); return; }
      await shift.refresh();
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(t('common.success'), t('shiftReminder.extraRequestSent'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('shiftReminder.extraRequestFailed'));
    } finally {
      setBusy(false);
    }
  };

  // A tapped shift-issue notification names the thread to open.
  const { issueId } = useLocalSearchParams<{ issueId?: string }>();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([shift.refresh(), loadExtras(), timeOffOn ? leave.refresh() : Promise.resolve()]);
    setRefreshing(false);
  };

  // Counted so far on the running shift — today's bar includes it.
  const runningMinutes = entry
    ? Math.max(
        0,
        Math.floor((now.getTime() - new Date(entry.countedStartAt ?? entry.clockInAt).getTime()) / 60_000) -
          (entry.unpaidBreakMinutes ?? 0),
      )
    : 0;
  const finishedToday = !entry ? totals.lastToday : null;
  const wide = r.isTablet ? centeredContent(720) : null;
  const tourScroll = useTourScroll();

  return {
    amazen,
    c,
    t,
    router,
    tabSafe,
    now,
    shift,
    status,
    entry,
    actions,
    totals,
    watch,
    hasShiftScheduling,
    canApproveExtraTime,
    recent,
    overtime,
    waiting,
    timeOffOn,
    leave,
    requestOpen,
    setRequestOpen,
    tiles,
    noShift,
    askMoreTime,
    busy,
    unconfirmed,
    unconfirmedTz,
    leavePicker,
    setLeavePicker,
    confirmLeaveTime,
    resolveForgot,
    requestExtra,
    clockOutRequest,
    requestClockOut,
    issueId,
    refreshing,
    onRefresh,
    runningMinutes,
    finishedToday,
    wide,
    tourScroll,
  };
}
