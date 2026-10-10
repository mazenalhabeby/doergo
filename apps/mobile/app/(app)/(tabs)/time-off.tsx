import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../src/contexts/auth-context';
import { mayReadTeamAvailability } from '../../../src/lib/permissions';
import { useToast } from '../../../src/island/island-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { useMyTimeOff } from '../../../src/components/time/use-my-time-off';
import { LoadingState, ErrorState } from '../../../src/components/screen-states';
import { ConfirmSheet, ScreenContainer } from '../../../src/components';
import { useTourScroll } from '../../../src/components/tour';
import { availabilityApi, type TimeOffRequest, type AvailabilityResponse } from '../../../src/lib/api';
import { COLORS, SPACING } from '../../../src/lib/constants';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';
import { useTabSafe } from '../../../src/components/amazen';
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
import { styles } from '../../../src/components/time-off/styles';

/**
 * TIME OFF — the member's leave: four tiles, the month to pick a range on,
 * the team's availability over it (for somebody who may read it), the request
 * form, and the list of requests.
 *
 * The pieces live in `src/components/time-off/`; this route keeps the state and
 * the decisions. Their rules are plain functions there (`helpers.ts`,
 * `availability-plan.ts`) and tested on their own.
 */
export default function TimeOffScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const tabSafe = useTabSafe();
  const toast = useToast();
  const { t } = useTranslation();
  // Dates follow the active language rather than a hardcoded en-US locale.
  const { locale } = useTimeFormat();

  /*
    ⚠️ ONE COPY OF A MEMBER'S LEAVE — `useMyTimeOff`, shared with the Time tab's
    request sheet: the server's requests with those still on the phone laid on
    top, a withdrawal on the phone already read as withdrawn.
  */
  const leave = useMyTimeOff();
  const { requests, schedule, isLoading, isRefreshing, error, fetchData } = leave;
  const refreshData = leave.refresh;

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

  // Request form
  const [reasonType, setReasonType] = useState<string>('vacation');
  const [reasonNotes, setReasonNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Request list filter
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('upcoming');

  // Confirm sheet state
  const [cancelTarget, setCancelTarget] = useState<TimeOffRequest | null>(null);
  const lastFetchTimeRef = useRef(0);

  // Schedule day lookup: dayOfWeek (0=Mon..6=Sun) → isActive
  const scheduleDays = useMemo(() => scheduleDayMap(schedule), [schedule]);

  // The member's own time off on the calendar
  const approvedDates = useMemo(() => datesWithStatus(requests, 'APPROVED'), [requests]);
  const pendingDates = useMemo(() => datesWithStatus(requests, 'PENDING'), [requests]);

  // =========================================================================
  // DATA FETCHING
  // =========================================================================

  // Fetch on mount & tab focus
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
  // CALENDAR NAVIGATION
  // =========================================================================

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  // =========================================================================
  // CALENDAR TAP HANDLING
  // =========================================================================

  const handleDayPress = (date: Date) => {
    // Don't allow past dates
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return;

    // Don't allow non-scheduled days
    const isScheduled = schedule.length === 0 || scheduleDays[mondayDow(date)] === true;
    if (!isScheduled) return;

    if (!isSelecting || !rangeStart) {
      // First tap - set start
      setRangeStart(date);
      setRangeEnd(null);
      setIsSelecting(true);
    } else {
      // Second tap - set end (auto-order)
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
    setReasonType('vacation');
    setReasonNotes('');
  };

  // =========================================================================
  // AVAILABILITY INSIGHTS
  // =========================================================================

  const availabilityInsights = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    return insightsFor(rangeStart, rangeEnd, availabilityCache, scheduleDays, schedule.length, user?.id);
  }, [rangeStart, rangeEnd, availabilityCache, scheduleDays, schedule.length, user?.id]);

  // =========================================================================
  // SUBMIT REQUEST
  // =========================================================================

  const handleSubmitRequest = async () => {
    if (!user?.id || !rangeStart || !rangeEnd) return;

    const startStr = toDateString(rangeStart);
    const endStr = toDateString(rangeEnd);
    const reasonLabel = t(`timeOff.reasonTypes.${reasonType}`);
    const fullReason = reasonNotes.trim()
      ? `${reasonLabel}: ${reasonNotes.trim()}`
      : reasonLabel;

    try {
      setIsSubmitting(true);
      const outcome = await leave.request({ startDate: startStr, endDate: endStr, reason: fullReason });
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.requestForm.failedToSubmit'));
        return;
      }
      clearSelection();
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(t('common.success'), t('timeOff.requestForm.successMessage'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.requestForm.failedToSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmCancelTimeOff = async () => {
    if (!cancelTarget) return;
    const request = cancelTarget;
    setCancelTarget(null);
    try {
      const outcome = await leave.cancel(request.id);
      if (outcome.kind === 'refused') {
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.failedToCancel'),
        );
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.failedToCancel'));
    }
  };

  // =========================================================================
  // DERIVED
  // =========================================================================

  const stats = useMemo(() => timeOffStats(requests, today), [requests, today]);
  const filteredRequests = useMemo(() => filterRequests(requests, requestFilter, today), [requests, requestFilter, today]);

  const hasRangeSelected = rangeStart !== null && rangeEnd !== null;
  const rangeDays = hasRangeSelected ? getDayCount(toDateString(rangeStart!), toDateString(rangeEnd!)) : 0;

  // =========================================================================
  // RENDER
  // =========================================================================

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScreenContainer width="content">
      <ScrollView
        {...tourScroll}
        style={styles.scrollView}
        // ⚠️ Room for the floating tab pill — it reserves no layout of its own.
        contentContainerStyle={{ paddingBottom: tabSafe }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        <TimeOffStatsRow stats={stats} />

        {schedule.length === 0 && <ScheduleNotSetBanner />}

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

        {hasRangeSelected && canSeeTeamAvailability && (
          <TeamAvailabilityPanel
            loading={isLoadingAvailability}
            failed={availabilityError}
            insights={availabilityInsights}
            locale={locale}
          />
        )}

        {hasRangeSelected && (
          <TimeOffRequestForm
            rangeStart={rangeStart!}
            rangeEnd={rangeEnd!}
            rangeDays={rangeDays}
            locale={locale}
            reasonType={reasonType}
            onReasonType={setReasonType}
            reasonNotes={reasonNotes}
            onReasonNotes={setReasonNotes}
            isSubmitting={isSubmitting}
            onClear={clearSelection}
            onSubmit={handleSubmitRequest}
          />
        )}

        <TimeOffRequestsList
          requests={filteredRequests}
          filter={requestFilter}
          onFilter={setRequestFilter}
          locale={locale}
          onCancel={setCancelTarget}
        />

        {/* Bottom spacing */}
        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
      </ScreenContainer>

      <ConfirmSheet
        visible={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancelTimeOff}
        title={t('timeOff.cancelConfirmTitle')}
        message={t('timeOff.cancelConfirmMessage')}
        confirmLabel={t('timeOff.cancelRequest')}
        cancelLabel={t('common.no')}
        variant="warning"
      />
    </View>
  );
}
