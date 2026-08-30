import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../../src/contexts/auth-context';
import { useToast } from '../../../src/contexts/toast-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { useFetchData } from '../../../src/hooks/useFetchData';
import { LoadingState, ErrorState } from '../../../src/components/screen-states';
import { ConfirmSheet, ScreenContainer } from '../../../src/components';
import { TourTarget } from '../../../src/components/tour';
import {
  timeOffApi,
  availabilityApi,
  scheduleApi,
  type TimeOffRequest,
  type AvailabilityResponse,
  type ScheduleEntry,
} from '../../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';
import { getTimeOffStatusStyle } from '../../../src/lib/styles';
import { formatShortDate, isSameDay } from '../../../src/lib/utils';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';
import { FilterChip } from '../../../src/components/filter-chip';

// =============================================================================
// HELPERS
// =============================================================================

const REASON_TYPE_KEYS = ['vacation', 'sickLeave', 'family', 'other'] as const;

function getDayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

function getTypeIcon(reason?: string): keyof typeof Ionicons.glyphMap {
  if (!reason) return 'calendar-outline';
  const lower = reason.toLowerCase();
  if (lower.includes('sick') || lower.includes('medical')) return 'medkit-outline';
  if (lower.includes('personal') || lower.includes('family')) return 'people-outline';
  return 'sunny-outline';
}

function getTypeLabelKey(reason?: string): string {
  if (!reason) return 'timeOff.typeLabels.timeOff';
  const lower = reason.toLowerCase();
  if (lower.includes('sick') || lower.includes('medical')) return 'timeOff.typeLabels.sickLeave';
  if (lower.includes('personal') || lower.includes('family')) return 'timeOff.typeLabels.family';
  if (lower.includes('vacation') || lower.includes('holiday')) return 'timeOff.typeLabels.vacation';
  return 'timeOff.typeLabels.timeOff';
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLongDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build a grid of 6 rows x 7 columns for a month calendar (Mon-start). */
function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  // Convert JS getDay (0=Sun) to Mon-start (0=Mon)
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[][] = [];
  let dayNum = 1 - startDow;

  for (let row = 0; row < 6; row++) {
    const week: (Date | null)[] = [];
    for (let col = 0; col < 7; col++) {
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        week.push(new Date(year, month, dayNum));
      } else {
        week.push(null);
      }
      dayNum++;
    }
    // Skip trailing empty rows
    if (week.every(d => d === null) && row >= 4) break;
    grid.push(week);
  }

  return grid;
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return d >= s && d <= e;
}

type RequestFilter = 'upcoming' | 'past' | 'all';

// =============================================================================
// COMPONENT
// =============================================================================

export default function TimeOffScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();
  // Dates follow the active language rather than a hardcoded en-US locale.
  const { locale } = useTimeFormat();

  // Data - fetched via useFetchData
  const fetcher = useCallback(async () => {
    if (!user?.id) return { requests: [] as TimeOffRequest[], schedule: [] as ScheduleEntry[] };
    const [requestsData, scheduleData] = await Promise.all([
      timeOffApi.list(user.id),
      scheduleApi.getMine(user.id).catch(() => [] as ScheduleEntry[]),
    ]);
    return {
      requests: Array.isArray(requestsData) ? requestsData : [],
      schedule: Array.isArray(scheduleData) ? scheduleData : [],
    };
  }, [user?.id]);

  const {
    data: fetchedData,
    isLoading,
    isRefreshing,
    error,
    fetchData,
    refresh: refreshData,
    setData: setFetchedData,
  } = useFetchData({
    fetcher,
    initialData: { requests: [] as TimeOffRequest[], schedule: [] as ScheduleEntry[] },
  });

  const requests = fetchedData?.requests ?? [];
  const schedule = fetchedData?.schedule ?? [];

  // Calendar
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Range selection
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
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
  const scheduleDays = useMemo(() => {
    const map: Record<number, boolean> = {};
    schedule.forEach(entry => {
      // Backend dayOfWeek: 0=Mon..6=Sun (matches our calendar grid)
      map[entry.dayOfWeek] = entry.isActive;
    });
    return map;
  }, [schedule]);

  // Build lookup maps for user's own time-off on the calendar
  const approvedDates = useMemo(() => {
    const dateSet: Record<string, true> = {};
    requests.forEach(r => {
      if (r.status !== 'APPROVED') return;
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateSet[toDateString(d)] = true;
      }
    });
    return dateSet;
  }, [requests]);

  const pendingDates = useMemo(() => {
    const dateSet: Record<string, true> = {};
    requests.forEach(r => {
      if (r.status !== 'PENDING') return;
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateSet[toDateString(d)] = true;
      }
    });
    return dateSet;
  }, [requests]);

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
  }, [fetchData]);

  // Only admins/dispatchers can fetch availability data
  const isAdminOrDispatcher = user?.role === 'ADMIN' || user?.role === 'CLIENT' || user?.role === 'DISPATCHER';

  // Fetch availability when range changes (admin/dispatcher only)
  useEffect(() => {
    if (!rangeStart || !rangeEnd || !isAdminOrDispatcher) return;

    const days: string[] = [];
    const d = new Date(rangeStart);
    const end = new Date(rangeEnd);
    while (d <= end && days.length < 14) {
      days.push(toDateString(d));
      d.setDate(d.getDate() + 1);
    }

    if (days.length === 0) return;

    let cancelled = false;
    setIsLoadingAvailability(true);
    setAvailabilityError(false);

    // Fetch sequentially to avoid throttle limits (3/sec)
    (async () => {
      const cache: Record<string, AvailabilityResponse> = {};
      let anySuccess = false;
      for (const date of days) {
        if (cancelled) return;
        try {
          const r = await availabilityApi.getForDate(date);
          if (r) {
            cache[date] = r;
            anySuccess = true;
          }
        } catch {
          // skip failed dates
        }
      }
      if (cancelled) return;
      if (anySuccess) {
        setAvailabilityCache(prev => ({ ...prev, ...cache }));
      } else {
        setAvailabilityError(true);
      }
      setIsLoadingAvailability(false);
    })();

    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd]);

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
    let dow = date.getDay() - 1;
    if (dow < 0) dow = 6;
    const isScheduled = schedule.length === 0 || scheduleDays[dow] === true;
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

    const days: string[] = [];
    const d = new Date(rangeStart);
    const end = new Date(rangeEnd);
    while (d <= end) {
      days.push(toDateString(d));
      d.setDate(d.getDate() + 1);
    }

    let worstAvailable = Infinity;
    let worstTotal = 0;
    let worstDay = '';
    const teamOnTimeOff: Record<string, string> = {}; // id → name
    let hasAnyData = false;
    const userNotScheduledDays: string[] = [];

    days.forEach(dayStr => {
      const data = availabilityCache[dayStr];
      if (!data) return;
      hasAnyData = true;

      const available = data.summary.available;
      const total = data.summary.total;
      if (available < worstAvailable) {
        worstAvailable = available;
        worstTotal = total;
        worstDay = dayStr;
      }

      data.technicians.forEach(tech => {
        if (tech.onTimeOff && tech.id !== user?.id) {
          teamOnTimeOff[tech.id] = `${tech.firstName} ${tech.lastName}`;
        }
      });

      // Check if user is scheduled that day
      const dayDate = new Date(dayStr + 'T00:00:00');
      let dow = dayDate.getDay() - 1;
      if (dow < 0) dow = 6;
      const userScheduled = scheduleDays[dow];
      if (userScheduled === false || (schedule.length > 0 && userScheduled === undefined)) {
        userNotScheduledDays.push(dayStr);
      }
    });

    if (!hasAnyData) return null;

    return {
      worstAvailable: worstAvailable === Infinity ? 0 : worstAvailable,
      worstTotal,
      worstDay,
      lowCoverage: worstAvailable <= 1 && worstAvailable !== Infinity,
      teamOnTimeOff: Object.values(teamOnTimeOff),
      userNotScheduledDays,
    };
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
      await timeOffApi.request(user.id, {
        startDate: startStr,
        endDate: endStr,
        reason: fullReason,
      });
      clearSelection();
      toast.success(t('common.success'), t('timeOff.requestForm.successMessage'));
      fetchData();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.requestForm.failedToSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = (request: TimeOffRequest) => {
    setCancelTarget(request);
  };

  const confirmCancelTimeOff = async () => {
    if (!cancelTarget) return;
    const request = cancelTarget;
    setCancelTarget(null);
    try {
      await timeOffApi.cancel(request.id);
      fetchData();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.failedToCancel'));
    }
  };

  // =========================================================================
  // STATS
  // =========================================================================

  const stats = useMemo(() => {
    const todayStr = toDateString(today);
    const approved = requests.filter(r => r.status === 'APPROVED');
    return {
      daysUsed: approved
        .filter(r => r.endDate < todayStr)
        .reduce((sum, r) => sum + getDayCount(r.startDate, r.endDate), 0),
      upcoming: approved
        .filter(r => r.endDate >= todayStr)
        .reduce((sum, r) => sum + getDayCount(r.startDate, r.endDate), 0),
      pending: requests.filter(r => r.status === 'PENDING').length,
      rejected: requests.filter(r => r.status === 'REJECTED').length,
    };
  }, [requests, today]);

  // =========================================================================
  // FILTERED REQUESTS
  // =========================================================================

  const filteredRequests = useMemo(() => {
    const todayStr = toDateString(today);
    switch (requestFilter) {
      case 'upcoming':
        return requests.filter(r =>
          r.endDate >= todayStr && (r.status === 'PENDING' || r.status === 'APPROVED')
        );
      case 'past':
        return requests.filter(r =>
          r.endDate < todayStr || r.status === 'REJECTED' || r.status === 'CANCELED'
        );
      default:
        return requests;
    }
  }, [requests, requestFilter, today]);

  // =========================================================================
  // CALENDAR GRID
  // =========================================================================

  const monthGrid = useMemo(
    () => getMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

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
        style={styles.scrollView}
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
        {/* ============================================================= */}
        {/* STATS ROW                                                     */}
        {/* ============================================================= */}
        <TourTarget name="timeoff-header" style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="checkmark-done" size={18} color={COLORS.primary} />
            </View>
            <Text style={[styles.statNumber, { color: COLORS.primary }]}>{stats.daysUsed}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={2}>{t('timeOff.stats.daysUsed')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.successLight }]}>
              <Ionicons name="sunny" size={18} color={COLORS.success} />
            </View>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.upcoming}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={2}>{t('timeOff.stats.upcoming')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.amberLight }]}>
              <Ionicons name="hourglass" size={18} color={COLORS.amber} />
            </View>
            <Text style={[styles.statNumber, { color: COLORS.amber }]}>{stats.pending}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={2}>{t('timeOff.stats.pending')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.errorLight }]}>
              <Ionicons name="ban" size={18} color={COLORS.error} />
            </View>
            <Text style={[styles.statNumber, { color: COLORS.error }]}>{stats.rejected}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={2}>{t('timeOff.stats.rejected')}</Text>
          </View>
        </TourTarget>

        {/* Schedule info banner */}
        {schedule.length === 0 && (
          <View style={[styles.infoBanner, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.infoBannerText}>
              {t('timeOff.scheduleNotSet')}
            </Text>
          </View>
        )}

        {/* ============================================================= */}
        {/* MONTHLY CALENDAR                                              */}
        {/* ============================================================= */}
        <TourTarget name="timeoff-request" style={[styles.calendarCard, { backgroundColor: colors.card }]}>
          {/* Month header */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={goToPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToToday}>
              <Text style={[styles.calendarTitle, { color: colors.textPrimary }]}>
                {t(`monthNames.${viewMonth}`)} {viewYear}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={styles.dayHeaderRow}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <View key={i} style={styles.dayHeaderCell}>
                <Text style={[styles.dayHeaderText, { color: colors.textMuted }]}>{t(`dayNames.short.${i}`)}</Text>
              </View>
            ))}
          </View>

          {/* Grid */}
          {monthGrid.map((week, rowIdx) => (
            <View key={rowIdx} style={styles.weekRow}>
              {week.map((date, colIdx) => {
                if (!date) {
                  return <View key={colIdx} style={styles.dayCell} />;
                }

                const ds = toDateString(date);
                const isToday = isSameDay(date, today);
                const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const dow = colIdx; // 0=Mon..6=Sun

                // Schedule: user is active on this day?
                const isScheduled = schedule.length === 0 || scheduleDays[dow] === true;

                // Time-off dots
                const hasApproved = !!approvedDates[ds];
                const hasPending = !!pendingDates[ds];

                // Range highlighting
                const inRange = hasRangeSelected && isDateInRange(date, rangeStart!, rangeEnd!);
                const isRangeEndpoint =
                  (rangeStart && isSameDay(date, rangeStart)) ||
                  (rangeEnd && isSameDay(date, rangeEnd));
                const isOnlyStart = rangeStart && !rangeEnd && isSameDay(date, rangeStart);

                const isDayDisabled = isPast || (!isScheduled && !isPast);

                return (
                  <TouchableOpacity
                    key={colIdx}
                    style={[
                      styles.dayCell,
                      inRange && isScheduled && [styles.dayCellInRange, { backgroundColor: colors.primaryLight }],
                      (isRangeEndpoint || isOnlyStart) && isScheduled && styles.dayCellEndpoint,
                      isToday && !inRange && !isRangeEndpoint && !isOnlyStart && styles.dayCellToday,
                    ]}
                    onPress={() => handleDayPress(date)}
                    disabled={isDayDisabled}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        { color: colors.textPrimary },
                        isPast && [styles.dayTextPast, { color: colors.borderLight }],
                        !isScheduled && !isPast && [styles.dayTextOffDay, { color: colors.textMuted, opacity: 0.4 }],
                        inRange && isScheduled && styles.dayTextInRange,
                        (isRangeEndpoint || isOnlyStart) && isScheduled && styles.dayTextEndpoint,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {/* Dots container */}
                    <View style={styles.dotRow}>
                      {hasApproved && <View style={[styles.dot, { backgroundColor: COLORS.success }]} />}
                      {hasPending && <View style={[styles.dot, { backgroundColor: COLORS.amber }]} />}
                      {!isScheduled && !isPast && !hasApproved && !hasPending && (
                        <View style={[styles.dot, { backgroundColor: COLORS.slate300 }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={[styles.legendRow, { borderTopColor: colors.border }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('timeOff.calendar.legend.approved')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.amber }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('timeOff.calendar.legend.pending')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.slate300 }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('timeOff.calendar.legend.offDay')}</Text>
            </View>
          </View>

          {isSelecting && rangeStart && !rangeEnd && (
            <Text style={styles.selectionHint}>
              {t('timeOff.calendar.selectionHint')}
            </Text>
          )}
        </TourTarget>

        {/* ============================================================= */}
        {/* AVAILABILITY INSIGHT PANEL                                    */}
        {/* ============================================================= */}
        {hasRangeSelected && isAdminOrDispatcher && (
          <View style={[styles.insightCard, { backgroundColor: colors.card }]}>
            <View style={styles.insightHeader}>
              <Ionicons name="people" size={18} color={COLORS.primary} />
              <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>{t('timeOff.teamAvailability.title')}</Text>
            </View>

            {isLoadingAvailability ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
            ) : availabilityError ? (
              <Text style={[styles.insightMuted, { color: colors.textMuted }]}>{t('timeOff.teamAvailability.unableToLoad')}</Text>
            ) : availabilityInsights ? (
              <View style={styles.insightContent}>
                <Text style={[styles.insightSummary, { color: colors.textPrimary }]}>
                  {t('timeOff.teamAvailability.techsAvailable', { available: availabilityInsights.worstAvailable, total: availabilityInsights.worstTotal })}
                  {availabilityInsights.worstDay && (
                    <Text style={[styles.insightMuted, { color: colors.textMuted }]}>
                      {' '}{t('timeOff.teamAvailability.worst', { date: formatShortDate(availabilityInsights.worstDay, locale) })}
                    </Text>
                  )}
                </Text>

                {availabilityInsights.lowCoverage && (
                  <View style={[styles.warningRow, { backgroundColor: colors.amberLight }]}>
                    <Ionicons name="warning" size={16} color={COLORS.amber} />
                    <Text style={styles.warningText}>
                      {t('timeOff.teamAvailability.lowCoverage', { date: formatShortDate(availabilityInsights.worstDay, locale) })}
                    </Text>
                  </View>
                )}

                {availabilityInsights.userNotScheduledDays.length > 0 && (
                  <View style={[styles.warningRow, { backgroundColor: colors.amberLight }]}>
                    <Ionicons name="information-circle" size={16} color={COLORS.primary} />
                    <Text style={styles.warningText}>
                      {availabilityInsights.userNotScheduledDays.length > 1
                        ? t('timeOff.teamAvailability.notScheduledPlural', { count: availabilityInsights.userNotScheduledDays.length })
                        : t('timeOff.teamAvailability.notScheduled', { count: availabilityInsights.userNotScheduledDays.length })}
                    </Text>
                  </View>
                )}

                {availabilityInsights.teamOnTimeOff.length > 0 && (
                  <View style={styles.teamOffSection}>
                    <Text style={[styles.teamOffLabel, { color: colors.textSecondary }]}>{t('timeOff.teamAvailability.alsoOnTimeOff')}</Text>
                    {availabilityInsights.teamOnTimeOff.slice(0, 5).map((name, i) => (
                      <Text key={i} style={[styles.teamOffName, { color: colors.textSecondary }]}>{name}</Text>
                    ))}
                    {availabilityInsights.teamOnTimeOff.length > 5 && (
                      <Text style={[styles.teamOffMore, { color: colors.textMuted }]}>
                        {t('common.more', { count: availabilityInsights.teamOnTimeOff.length - 5 })}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
            )}
          </View>
        )}

        {/* ============================================================= */}
        {/* REQUEST FORM                                                  */}
        {/* ============================================================= */}
        {hasRangeSelected && (
          <View style={[styles.formCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{t('timeOff.requestForm.title')}</Text>

            {/* Date range display */}
            <View style={[styles.formDateRow, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
              <Text style={styles.formDateText}>
                {formatLongDate(rangeStart!, locale)} – {formatLongDate(rangeEnd!, locale)} ({rangeDays} {rangeDays > 1 ? t('common.days') : t('common.day')})
              </Text>
            </View>

            {/* Reason type chips */}
            <Text style={[styles.formLabel, { color: colors.textPrimary }]}>{t('timeOff.requestForm.reasonLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <View style={styles.chipRow}>
                {REASON_TYPE_KEYS.map(key => (
                  <FilterChip
                    key={key}
                    label={t(`timeOff.reasonTypes.${key}`)}
                    active={reasonType === key}
                    onPress={() => setReasonType(key)}
                  />
                ))}
              </View>
            </ScrollView>

            {/* Optional notes */}
            <Text style={[styles.formLabel, { color: colors.textPrimary }]}>{t('timeOff.requestForm.notesLabel')}</Text>
            <TextInput
              style={[styles.notesInput, { borderColor: colors.border, color: colors.textPrimary }]}
              placeholder={t('timeOff.requestForm.notesPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={reasonNotes}
              onChangeText={setReasonNotes}
              multiline
              maxLength={500}
            />

            {/* Action buttons */}
            <View style={styles.formButtons}>
              <TouchableOpacity style={[styles.clearButton, { borderColor: colors.border }]} onPress={clearSelection}>
                <Text style={[styles.clearButtonText, { color: colors.textSecondary }]}>{t('timeOff.requestForm.clearSelection')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleSubmitRequest}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={16} color={COLORS.white} />
                    <Text style={styles.submitButtonText}>{t('timeOff.requestForm.submitRequest')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ============================================================= */}
        {/* REQUESTS LIST                                                 */}
        {/* ============================================================= */}
        <TourTarget name="timeoff-list" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('timeOff.myRequests')}</Text>

          {/* Segmented filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              <FilterChip
                label={t('timeOff.filters.upcoming')}
                active={requestFilter === 'upcoming'}
                onPress={() => setRequestFilter('upcoming')}
              />
              <FilterChip
                label={t('timeOff.filters.past')}
                active={requestFilter === 'past'}
                onPress={() => setRequestFilter('past')}
              />
              <FilterChip
                label={t('timeOff.filters.all')}
                active={requestFilter === 'all'}
                onPress={() => setRequestFilter('all')}
              />
            </View>
          </ScrollView>

          {filteredRequests.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {t(`timeOff.empty.${requestFilter}`)}
              </Text>
              {requestFilter === 'upcoming' && (
                <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                  {t('timeOff.empty.hint')}
                </Text>
              )}
            </View>
          ) : (
            filteredRequests.map(request => {
              const statusStyle = getTimeOffStatusStyle(request.status, colors);
              const days = getDayCount(request.startDate, request.endDate);
              const typeLabel = t(getTypeLabelKey(request.reason));
              const typeIcon = getTypeIcon(request.reason);

              return (
                <View key={request.id} style={[styles.requestCard, { backgroundColor: colors.card }]}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestType}>
                      <Ionicons name={typeIcon} size={20} color={COLORS.primary} />
                      <Text style={[styles.requestTypeText, { color: colors.textPrimary }]}>{typeLabel}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                      <Text style={[styles.statusText, { color: statusStyle.text }]}>
                        {t(`timeOffStatus.${request.status}`)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.requestDetails}>
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                      <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                        {formatShortDate(request.startDate, locale)}
                        {request.startDate !== request.endDate && ` – ${formatShortDate(request.endDate, locale)}`}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                      <Text style={[styles.detailText, { color: colors.textSecondary }]}>{days} {days > 1 ? t('common.days') : t('common.day')}</Text>
                    </View>
                  </View>

                  {request.reason && (
                    <Text style={[styles.reasonText, { color: colors.textSecondary }]} numberOfLines={2}>{request.reason}</Text>
                  )}

                  {request.status === 'APPROVED' && request.approvedBy && (
                    <View style={[styles.approvedRow, { borderTopColor: colors.border }]}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                      <Text style={styles.approvedText}>
                        {t('timeOff.approvedBy', { firstName: request.approvedBy.firstName, lastName: request.approvedBy.lastName })}
                      </Text>
                    </View>
                  )}

                  {request.rejectionReason && (
                    <View style={[styles.rejectionRow, { borderTopColor: colors.border }]}>
                      <Ionicons name="information-circle-outline" size={14} color={COLORS.error} />
                      <Text style={styles.rejectionText}>{request.rejectionReason}</Text>
                    </View>
                  )}

                  {request.status === 'PENDING' && (
                    <TouchableOpacity
                      style={[styles.cancelButton, { borderTopColor: colors.border }]}
                      onPress={() => handleCancel(request)}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                      <Text style={styles.cancelButtonText}>{t('timeOff.cancelRequest')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </TourTarget>

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

// =============================================================================
// STYLES
// =============================================================================

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  // Stats
  /*
    Four tiles across, sized for the LONGEST language rather than the shortest.

    German broke "Ausstehend" across two lines mid-word, which is what React
    Native does when a single word is wider than its box — there is no
    hyphenation to fall back on, so it simply cuts. English never showed it:
    "Pending" is three characters shorter and the tiles were built around it.

    A tighter gap and tighter padding buy roughly 11pt of text width per tile,
    which is what a ten-character word needs at this size — and ten characters
    covers the longest label in all five languages ("Ausstehend", "Pendientes",
    "Rechazadas") with room to spare on a 375pt phone.
  */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.xs,
  },
  statCard: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  statNumber: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
    /*
      Two lines' worth, always. A one-word label next to a two-word one left the
      tiles with their text sitting at different heights — the row read as four
      cards that had been laid out separately, which in a language where two of
      the four wrap is most of them.
    */
    height: 30,
  },

  // Info banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  infoBannerText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
  },

  // Calendar card
  calendarCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  calendarTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Day headers
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase',
  },

  // Week rows & day cells
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: CELL_SIZE,
    borderRadius: RADIUS.sm,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  dayCellInRange: {
  },
  dayCellEndpoint: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
  },
  dayText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  dayTextPast: {
  },
  dayTextOffDay: {
  },
  dayTextInRange: {
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHT.semibold,
  },
  dayTextEndpoint: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHT.bold,
  },

  // Dots
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    height: 6,
    alignItems: 'center',
    marginTop: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FONT_SIZE.xs,
  },

  selectionHint: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },

  // Insight card
  insightCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  insightTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  insightContent: {
    gap: SPACING.sm,
  },
  insightSummary: {
    fontSize: FONT_SIZE.base,
  },
  insightMuted: {
    fontSize: FONT_SIZE.sm,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  warningText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.amber,
    fontWeight: FONT_WEIGHT.medium,
  },
  teamOffSection: {
    marginTop: SPACING.xs,
  },
  teamOffLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.xs,
  },
  teamOffName: {
    fontSize: FONT_SIZE.sm,
    paddingLeft: SPACING.md,
    marginBottom: 2,
  },
  teamOffMore: {
    fontSize: FONT_SIZE.sm,
    paddingLeft: SPACING.md,
    fontStyle: 'italic',
  },

  // Form card
  formCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  formTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.md,
  },
  formDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.lg,
  },
  formDateText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHT.medium,
  },
  formLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm,
  },
  chipScroll: {
    marginBottom: SPACING.lg,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  formButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  clearButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  submitButton: {
    flex: 1.5,
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  submitButtonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Requests section
  section: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.md,
  },
  filterScroll: {
    marginBottom: SPACING.lg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  emptyState: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },

  // Request cards
  requestCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  requestType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  requestTypeText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  requestDetails: {
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailText: {
    fontSize: FONT_SIZE.base,
  },
  reasonText: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.sm,
  },
  approvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  approvedText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.success,
  },
  rejectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  rejectionText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.error,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  cancelButtonText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.error,
    fontWeight: FONT_WEIGHT.medium,
  },
});
