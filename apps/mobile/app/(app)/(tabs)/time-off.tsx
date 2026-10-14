import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { hasAccessModule, moduleAnywhere, type DetectedRequest, type LeaveType, type RequestKind } from '@hbcfield/shared/client';
import { useAuth } from '../../../src/contexts/auth-context';
import { mayReadTeamAvailability } from '../../../src/lib/permissions';
import { useToast } from '../../../src/island/island-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { useMyTimeOff } from '../../../src/components/time/use-my-time-off';
import { LoadingState, ErrorState } from '../../../src/components/screen-states';
import { useTourScroll, TourTarget } from '../../../src/components/tour';
import { availabilityApi, type AvailabilityResponse } from '../../../src/lib/api';
import type { ActionOutcome } from '../../../src/offline/actions/outcome';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';
import { useResponsive } from '../../../src/lib/responsive';
import { centeredContent } from '../../../src/components/screen-container';
import { Ground, PrimaryButton, ScreenHeader, useTabSafe } from '../../../src/components/amazen';
import {
  availabilityInsights as insightsFor, datesWithStatus, filterRequests, getDayCount, mondayDow,
  scheduleDayMap, timeOffStats, toDateString, type RequestFilter,
} from '../../../src/components/time-off/helpers';
import { daysNotAnswered, mapLimited, mergeAvailability, planAvailabilityFetch, rangeUnsupported } from '../../../src/components/time-off/availability-plan';
import { TimeOffStatsRow, ScheduleNotSetBanner } from '../../../src/components/time-off/stats-row';
import { TimeOffCalendarCard } from '../../../src/components/time-off/calendar-card';
import { TeamAvailabilityPanel } from '../../../src/components/time-off/availability-panel';
import { TimeOffRequestForm } from '../../../src/components/time-off/request-form';
import { TimeOffRequestsList } from '../../../src/components/time-off/requests-list';
import { KindChooserSheet, RequestDetailSheet, type RequestRowData } from '../../../src/components/requests/request-parts';
import { RequestFormCard } from '../../../src/components/requests/request-form-card';
import { draftToBody, type RequestBody } from '../../../src/components/requests/request-model';
import { useRequestOptions } from '../../../src/components/requests/use-request-options';

/**
 * REQUESTS — everything a member asks the person responsible for them: leave
 * (on the month, as always), working remotely, a changed day, overtime agreed
 * in advance, or anything else in words. Four figures, New request, the month,
 * and the list of requests of every kind.
 *
 * The route keeps its old file name (`time-off`) so every push tap, deep link
 * and the calendar's "New › Time off" still land here; only the words changed.
 *
 * The pieces live in `src/components/time-off/` (leave) and
 * `src/components/requests/` (every kind); their rules are plain functions
 * there and tested on their own.
 */
export default function RequestsScreen() {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const c = amazen.color;
  const tabSafe = useTabSafe();
  const toast = useToast();
  const { t } = useTranslation();
  const { locale } = useTimeFormat();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  /*
    ⚠️ ONE COPY OF A MEMBER'S REQUESTS — `useMyTimeOff`, shared with the Time
    tab's request sheet: the server's requests with those still on the phone
    laid on top, a withdrawal on the phone already read as withdrawn.
  */
  const leave = useMyTimeOff();
  const { requests, absences, schedule, isLoading, isRefreshing, error, fetchData } = leave;
  const refreshData = leave.refresh;
  // What this member may ask for — read after the first paint, cached for the session.
  const { options } = useRequestOptions();
  const offered = options?.kinds ?? null;
  const leaveOffered = !offered || offered.includes('LEAVE');
  const otherKinds = (offered ?? []).filter((k) => k !== 'LEAVE');

  // Calendar
  const today = useMemo(() => new Date(), []);
  const tourScroll = useTourScroll();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Range selection
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  /*
    Opened from the calendar's New › Time off (`?from=YYYY-MM-DD`): the request starts on that day
    and the month opens on it. Adopted once, then cleared; a past or malformed day is ignored.
  */
  const fromParam = useLocalSearchParams<{ from?: string | string[] }>().from;
  const linkedFrom = typeof fromParam === 'string' ? fromParam : '';
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(linkedFrom)) return;
    const [y, m, d] = linkedFrom.split('-').map(Number);
    const day = new Date(y!, m! - 1, d!);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    if (day >= t0) {
      setRangeStart(day); setRangeEnd(day); setViewYear(day.getFullYear()); setViewMonth(day.getMonth());
    }
    router.setParams({ from: '' });
  }, [linkedFrom]);
  const [isSelecting, setIsSelecting] = useState(false);

  // Availability
  const [availabilityCache, setAvailabilityCache] = useState<Record<string, AvailabilityResponse>>({});
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);

  // The leave form
  const [leaveType, setLeaveType] = useState<LeaveType>('VACATION');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Any other kind: chosen in the sheet, filled in on the page.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [formKind, setFormKind] = useState<Exclude<RequestKind, 'LEAVE'> | null>(null);
  // Filled in from "This looks like…" — the member still checks and sends.
  const [formInitial, setFormInitial] = useState<{ start?: string; end?: string; startTime?: string; endTime?: string; minutes?: number; reason?: string } | null>(null);

  // The list
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('upcoming');
  const [detail, setDetail] = useState<RequestRowData | null>(null);
  const lastFetchTimeRef = useRef(0);

  const scheduleDays = useMemo(() => scheduleDayMap(schedule), [schedule]);
  // Only LEAVE marks the month — a remote day is a day worked.
  const approvedDates = useMemo(() => datesWithStatus(absences, 'APPROVED'), [absences]);
  const pendingDates = useMemo(() => datesWithStatus(absences, 'PENDING'), [absences]);
  const spaceName = useCallback(
    (id: string | null | undefined) => (id ? options?.remoteSpaces.find((s) => s.id === id)?.name ?? null : null),
    [options],
  );

  // =========================================================================
  // DATA FETCHING
  // =========================================================================

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFetchTimeRef.current < 30000) return;
      lastFetchTimeRef.current = Date.now();
      fetchData();
    }, [fetchData])
  );

  const handleRefresh = useCallback(() => {
    setAvailabilityCache({});
    refreshData();
  }, [refreshData]);

  // Only somebody who may read the team's availability asks for it (see mayReadTeamAvailability).
  const canSeeTeamAvailability = mayReadTeamAvailability(user);

  /*
    The team's availability over the picked range.

    ⚠️ ONE REQUEST, AND ONLY FOR WHAT IS NOT KNOWN. This used to send a GET per
    day, one after another (up to fourteen per pick), and never looked in its
    own cache first. The server answers a range in one go; days already held
    are not asked again (`planAvailabilityFetch`). Only a server too old for the
    range form (400/404) falls back to single days — two at a time, under the
    3/sec limit.
  */
  const cacheRef = useRef(availabilityCache);
  cacheRef.current = availabilityCache;
  useEffect(() => {
    if (!rangeStart || !rangeEnd || !canSeeTeamAvailability) return;

    const plan = planAvailabilityFetch(rangeStart, rangeEnd, cacheRef.current);
    if (plan.days.length === 0) return;
    setAvailabilityError(false);
    if (!plan.fetch) { setIsLoadingAvailability(false); return; }

    let cancelled = false;
    setIsLoadingAvailability(true);

    (async () => {
      let answer: AvailabilityResponse[] = [];
      try {
        answer = (await availabilityApi.getForRange(plan.fetch!.from, plan.fetch!.to)) ?? [];
        /*
          ⚠️ The range form can come back a day SHORT: the server steps days in
          its own zone, and across a DST change (25 Oct) the last day falls off.
          The days it did not answer are asked one by one, two at a time.
        */
        const gaps = daysNotAnswered(plan.missing, answer);
        if (gaps.length && !cancelled) {
          const extra = await mapLimited(gaps, 2, (date) => availabilityApi.getForDate(date).catch(() => null));
          answer = [...answer, ...extra.filter((d): d is AvailabilityResponse => !!d)];
        }
      } catch (err) {
        if (rangeUnsupported(err)) {
          const days = await mapLimited(plan.missing, 2, (date) => availabilityApi.getForDate(date).catch(() => null));
          answer = days.filter((d): d is AvailabilityResponse => !!d);
        }
      }
      if (cancelled) return;
      // An error only when nothing at all is known for the range.
      const known = plan.days.some((d) => cacheRef.current[d]);
      if (answer.length) setAvailabilityCache((prev) => mergeAvailability(prev, answer));
      else if (!known) setAvailabilityError(true);
      setIsLoadingAvailability(false);
    })();

    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, canSeeTeamAvailability]);

  // =========================================================================
  // CALENDAR
  // =========================================================================

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1);
  };
  const goToToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  const handleDayPress = (date: Date) => {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return;
    const isScheduled = schedule.length === 0 || scheduleDays[mondayDow(date)] === true;
    if (!isScheduled) return;
    setFormKind(null);
    if (!isSelecting || !rangeStart) {
      setRangeStart(date);
      setRangeEnd(null);
      setIsSelecting(true);
    } else {
      const start = date < rangeStart ? date : rangeStart;
      const end = date < rangeStart ? rangeStart : date;
      setRangeStart(start);
      setRangeEnd(end);
      setIsSelecting(false);
    }
  };

  const clearSelection = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setIsSelecting(false);
    setLeaveType('VACATION');
    setNotes('');
  };

  const availabilityInsights = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    return insightsFor(rangeStart, rangeEnd, availabilityCache, scheduleDays, schedule.length, user?.id);
  }, [rangeStart, rangeEnd, availabilityCache, scheduleDays, schedule.length, user?.id]);

  // =========================================================================
  // SENDING
  // =========================================================================

  /** One path for every kind: the outbox carries the body unchanged, with or without signal. */
  const send = async (body: RequestBody, after: () => void) => {
    try {
      setIsSubmitting(true);
      const outcome: ActionOutcome = await leave.request(body);
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.requestForm.failedToSubmit'));
        return;
      }
      after();
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(t('common.success'), t('timeOff.requestForm.successMessage'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.requestForm.failedToSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLeave = () => {
    if (!user?.id || !rangeStart || !rangeEnd) return;
    const built = draftToBody({ kind: 'LEAVE', startDate: toDateString(rangeStart), endDate: toDateString(rangeEnd), type: leaveType, reason: notes });
    if (!built.ok) { toast.error(t('common.error'), t(`offline.errors.${built.code}`)); return; }
    void send(built.body, clearSelection);
  };

  /**
   * "Other" words that read as something the app has a form for: open THAT
   * form with what was read, the words kept as the reason. Nothing is sent.
   */
  const applySuggestion = (sug: DetectedRequest, words: string) => {
    const reason = words.trim();
    const offeredKind = (k: RequestKind) => !offered || offered.includes(k);
    if (sug.kind === 'LEAVE' && leaveOffered) {
      setFormKind(null); setFormInitial(null);
      const first = sug.startDate ?? toDateString(today);
      setRangeStart(new Date(`${first}T12:00:00`));
      setRangeEnd(new Date(`${sug.endDate ?? first}T12:00:00`));
      setIsSelecting(false);
      setLeaveType(sug.leaveType ?? 'VACATION');
      setNotes(reason);
      return;
    }
    if (sug.kind === 'EXPENSE' && moduleAnywhere(user as never, 'assets')) {
      router.push('/(app)/asset-expense' as never);
      return;
    }
    // More time today is asked on the running shift, from the clock.
    if (sug.kind === 'EXTRA_TIME' && hasAccessModule(user as never, 'clock')) {
      toast.info(t('requests.detect.askOnClock'));
      router.navigate('/(app)/(tabs)/attendance' as never);
      return;
    }
    const kind = sug.kind === 'EXTRA_TIME' ? 'OVERTIME' : sug.kind;
    if (kind === 'REMOTE' || kind === 'HOURS' || kind === 'OVERTIME') {
      if (!offeredKind(kind)) { toast.info(t('requests.detect.notOffered')); return; }
      setFormInitial({ start: sug.startDate, end: sug.endDate, startTime: sug.startTime, endTime: sug.endTime, minutes: sug.minutes, reason });
      setFormKind(kind);
    }
  };

  /*
    Opened from the Time tab's "Ask for more time" (`?ask=OVERTIME`): the overtime form for
    today, filled in. Adopted once the options are known, then cleared.
  */
  const askParam = useLocalSearchParams<{ ask?: string | string[] }>().ask;
  useEffect(() => {
    if (askParam !== 'OVERTIME' || !options) return;
    router.setParams({ ask: '' });
    if (offered && !offered.includes('OVERTIME')) { toast.info(t('requests.detect.notOffered')); return; }
    clearSelection();
    setFormInitial({ start: toDateString(today), minutes: 60 });
    setFormKind('OVERTIME');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askParam, options]);

  const pickKind = (kind: RequestKind) => {
    setChooserOpen(false);
    if (kind === 'LEAVE') { setFormKind(null); return; }
    clearSelection();
    setFormInitial(null);
    setFormKind(kind);
  };

  const withdraw = async (request: RequestRowData) => {
    const outcome = await leave.cancel(request.id);
    if (outcome.kind === 'refused') {
      throw new Error((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.failedToCancel'));
    }
    if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
  };

  // =========================================================================
  // DERIVED
  // =========================================================================

  const stats = useMemo(() => timeOffStats(requests, today), [requests, today]);
  const filteredRequests = useMemo(() => filterRequests(requests, requestFilter, today), [requests, requestFilter, today]);
  const hasRangeSelected = rangeStart !== null && rangeEnd !== null;
  const rangeDays = hasRangeSelected ? getDayCount(toDateString(rangeStart!), toDateString(rangeEnd!)) : 0;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('requests.title', 'Requests')} style={wide ?? undefined} />
      <ScrollView
        {...tourScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // ⚠️ Room for the floating tab pill — it reserves no layout of its own.
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe + amazen.space(6), gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[c.accent]} tintColor={c.accent} />}
      >
        <TimeOffStatsRow stats={stats} />

        {schedule.length === 0 && leaveOffered ? <ScheduleNotSetBanner /> : null}

        <TourTarget name="timeoff-request" style={{ gap: amazen.space(3) }}>
          {otherKinds.length > 0 && !formKind ? (
            <PrimaryButton label={t('requests.new', 'New request')} onPress={() => setChooserOpen(true)} />
          ) : null}

          {formKind ? (
            <RequestFormCard
              kind={formKind}
              options={options}
              busy={isSubmitting}
              onClose={() => { setFormKind(null); setFormInitial(null); }}
              onSubmit={(body) => void send(body, () => { setFormKind(null); setFormInitial(null); })}
              initial={formInitial}
              onSuggest={applySuggestion}
            />
          ) : leaveOffered ? (
            <TimeOffCalendarCard
              today={today}
              viewYear={viewYear}
              viewMonth={viewMonth}
              onPrevMonth={goToPrevMonth}
              onNextMonth={goToNextMonth}
              onToday={goToToday}
              scheduleLength={schedule.length}
              scheduleDays={scheduleDays}
              approvedDates={approvedDates}
              pendingDates={pendingDates}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              isSelecting={isSelecting}
              onDayPress={handleDayPress}
            />
          ) : null}
        </TourTarget>

        {!formKind && hasRangeSelected && canSeeTeamAvailability ? (
          <TeamAvailabilityPanel loading={isLoadingAvailability} failed={availabilityError} insights={availabilityInsights} locale={locale} />
        ) : null}

        {!formKind && hasRangeSelected ? (
          <TimeOffRequestForm
            rangeStart={rangeStart!}
            rangeEnd={rangeEnd!}
            rangeDays={rangeDays}
            leaveType={leaveType}
            onLeaveType={setLeaveType}
            notes={notes}
            onNotes={setNotes}
            isSubmitting={isSubmitting}
            onClear={clearSelection}
            onSubmit={submitLeave}
          />
        ) : null}

        <View style={{ height: amazen.space(1) }} />

        <TimeOffRequestsList
          requests={filteredRequests}
          filter={requestFilter}
          onFilter={setRequestFilter}
          onOpen={setDetail}
          spaceName={spaceName}
        />
      </ScrollView>

      <KindChooserSheet visible={chooserOpen} kinds={offered} onPick={pickKind} onClose={() => setChooserOpen(false)} />
      <RequestDetailSheet request={detail} spaceName={spaceName(detail?.spaceId)} onClose={() => setDetail(null)} onWithdraw={withdraw} />
    </Ground>
  );
}
