import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { orgHasAddOn, hasAccessModule } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { useResponsive } from '../../lib/responsive';
import { attendanceApi, overtimeApi, type OvertimeRequest, type TimeEntry } from '../../lib/api';
import { refusalText } from '../../lib/distance';
import { hhmmIn, leaveTimeFrom } from '../../offline/attendance/leave-time';
import { useShift, useShiftActions } from '../../offline/attendance/use-shift';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { stopBackgroundHeartbeat } from '../../services/background-heartbeat';
import { stopGeofence } from '../../services/background-geofence';
import { Ground, ScreenHeader, Well, useTabSafe } from '../amazen';
import { centeredContent } from '../screen-container';
import { ApproveGlyph } from '../glyphs/glyphs';
import { ShiftClockCardView } from '../home/shift-clock-card';
import { scheduleFor } from '../home/shift-state';
import { useScheduleTotals } from '../home/use-schedule-totals';
import { TimePickerModal } from '../time-picker-modal';
import { TourTarget } from '../tour';
import { TimeBanners, TimeLink } from './time-banners';
import { TimeHistory } from './time-history';
import { placesView } from './time-logic';
import { TimeOffSection } from './time-off-section';
import { TimePlaces } from './time-places';
import { TimeToday } from './time-today';
import { TimeWeek } from './time-week';
import { useMyTimeOff } from './use-my-time-off';
import { useShiftWatch } from './use-shift-watch';

/**
 * THE TIME TAB — built on the home's Shift clock card.
 *
 * ⚠️ THE CARD IS THE SAME COMPONENT AS THE HOME WIDGET, with every state and
 * every sheet it opens (clock in, rests, clock out, report, my issues). The
 * home and this page can never disagree about the shift, because there is one
 * drawing of it. This page adds what does not fit on a widget: where you work,
 * today as a timeline with its work log, the week, time off, recent shifts.
 *
 * ⚠️ ONE COPY OF THE SHIFT FOR THE WHOLE PAGE. `useShift` is called here and
 * handed to the card (`ShiftClockCardView`) and the timeline — two calls are
 * two loads and two answers that can disagree for a frame. Same for the
 * week's totals: asked once here, handed to the card.
 *
 * ⚠️ THE GROUND AND THE HEADER ARE THE SHARED ONES — the home's gradient and
 * `ScreenHeader`, whose avatar is its own business. No screen passes it.
 */
export function TimeScreen() {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const r = useResponsive();

  // The minute moves; nothing is counted up. Every figure derives from the clock.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ---------------- the shift ---------------- */
  const shift = useShift();
  useLiveRefresh(shift.refresh, null, { onReconnect: true });
  const status = shift.status;
  const entry = status?.isClockedIn ? status.currentEntry : null;
  const actions = useShiftActions();
  const totals = useScheduleTotals({
    schedule: scheduleFor(user?.scheduleType),
    revision: `${status?.isClockedIn ? '1' : '0'}:${status?.currentEntry?.id ?? ''}`,
    // The week bars need the week whatever the schedule — and the card reads the same answer.
    enabled: true,
    userId: user?.id ?? null,
  });
  const watch = useShiftWatch(status, shift.refresh);

  /* ---------------- recent shifts + extra time ---------------- */
  const [recent, setRecent] = useState<TimeEntry[]>([]);
  const [overtime, setOvertime] = useState<OvertimeRequest | null>(null);
  const loadExtras = useCallback(async () => {
    const [h, o] = await Promise.allSettled([attendanceApi.getHistory({ limit: 10 }), overtimeApi.getActive()]);
    if (h.status === 'fulfilled') {
      // ⚠️ A BARE ARRAY once unwrapped — see `attendanceApi.getHistory`.
      const v = h.value as unknown;
      setRecent(Array.isArray(v) ? (v as TimeEntry[]) : ((v as { data?: TimeEntry[] })?.data ?? []));
    }
    if (o.status === 'fulfilled') setOvertime(o.value ?? null);
  }, []);
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
          const { status: perm } = await Location.getForegroundPermissionsAsync();
          if (perm !== 'granted') return;
          const p = (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }))
            ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
          if (alive && p) setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
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

  /* ---------------- answers the page owns ---------------- */
  const [busy, setBusy] = useState(false);
  const say = (o: { code?: string; message?: string; params?: Record<string, unknown> }, fallback: string) => refusalText(t, o, fallback);

  // ⑦ — a shift closed with a temporary time: when did they really leave?
  const unconfirmed = status?.unconfirmedClockOut ?? null;
  const unconfirmedTz = unconfirmed?.timezone ?? unconfirmed?.location?.timezone ?? undefined;
  const [leavePicker, setLeavePicker] = useState(false);
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

  // Extra-time approvals are bought (shift_scheduling) and held by people who manage users.
  const hasShiftScheduling = orgHasAddOn(user?.orgAddOns, 'shift_scheduling');
  const canApproveExtraTime = !!user?.canManageUsers && hasShiftScheduling;

  // Counted so far on the running shift — today's bar includes it.
  const runningMinutes = entry
    ? Math.max(0, Math.floor((now.getTime() - new Date(entry.countedStartAt ?? entry.clockInAt).getTime()) / 60_000) - (entry.unpaidBreakMinutes ?? 0))
    : 0;
  const finishedToday = !entry ? totals.lastToday : null;
  const wide = r.isTablet ? centeredContent(720) : null;

  return (
    <Ground style={{ flex: 1 }}>
      <TourTarget name="attendance-header">
        <ScreenHeader
          title={t('tabs.attendance')}
          actions={timeOffOn ? [{ label: t('time.off.title', 'Time off'), onPress: () => setRequestOpen(true) }] : undefined}
          style={wide ?? undefined}
        />
      </TourTarget>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.accent} colors={[c.accent]} />}
      >
        <OfflineBanner />

        <TimeBanners
          status={status}
          breaks={shift.breaks}
          watch={watch}
          overtime={overtime}
          hasShiftScheduling={hasShiftScheduling}
          busy={busy}
          onForgot={(at) => void resolveForgot(at)}
          onRequestExtra={() => void requestExtra()}
          onChanged={() => void shift.refresh()}
        />

        <TourTarget name="attendance-clock">
          <ShiftClockCardView
            shift={shift}
            linkToTime={false}
            onSetRealTime={unconfirmed ? () => setLeavePicker(true) : undefined}
            openIssueId={issueId ?? null}
            totals={totals}
          />
        </TourTarget>

        <TimePlaces tiles={tiles} />

        <TourTarget name="attendance-status">
          <TimeToday running={entry} finished={finishedToday} breaks={shift.breaks?.todayBreaks ?? []} />
        </TourTarget>

        <TimeWeek weekDays={totals.weekDays} runningMinutes={runningMinutes} monthMinutes={totals.monthMinutes} now={now} />

        {timeOffOn ? <TimeOffSection leave={leave} requestOpen={requestOpen} setRequestOpen={setRequestOpen} now={now} /> : null}

        <TourTarget name="attendance-history">
          <TimeHistory entries={recent} now={now} />
        </TourTarget>

        {canApproveExtraTime ? (
          <Well style={{ padding: amazen.space(3) }}>
            <TimeLink
              Glyph={ApproveGlyph}
              label={t('shiftReminder.openEntryPoint')}
              hint={t('shiftReminder.openEntryPointDesc')}
              onPress={() => router.push('/extra-time' as Href)}
            />
          </Well>
        ) : null}
        <View style={{ height: amazen.space(2) }} />
      </ScrollView>

      {unconfirmed ? (
        <TimePickerModal
          visible={leavePicker}
          value={hhmmIn(new Date(unconfirmed.clockOutAt), unconfirmedTz ?? 'UTC')}
          title={t('attendance.unconfirmed.pickerTitle')}
          onClose={() => setLeavePicker(false)}
          onClear={() => setLeavePicker(false)}
          onSelect={(hhmm) => void confirmLeaveTime(hhmm)}
        />
      ) : null}
    </Ground>
  );
}
