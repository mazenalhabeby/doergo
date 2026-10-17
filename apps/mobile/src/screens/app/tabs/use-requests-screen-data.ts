import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { type LeaveType, type RequestKind } from "@hbcfield/shared/client";
import { useAuth } from "../../../contexts/auth-context";
import { mayReadTeamAvailability } from "../../../lib/permissions";
import { useToast } from "../../../island/island-context";
import { useTheme } from "../../../contexts/theme-context";
import { useMyTimeOff } from "../../../components/time/use-my-time-off";
import { useTourScroll } from "../../../components/tour";
import { availabilityApi, type AvailabilityResponse } from "../../../lib/api";
import { useTimeFormat } from "../../../hooks/useTimeFormat";
import { useResponsive } from "../../../lib/responsive";
import { centeredContent } from "../../../components/screen-container";
import { useTabSafe } from "../../../components/amazen";
import { datesWithStatus, scheduleDayMap, type RequestFilter } from "../../../components/time-off/helpers";
import {
  daysNotAnswered,
  mapLimited,
  mergeAvailability,
  planAvailabilityFetch,
  rangeUnsupported,
} from "../../../components/time-off/availability-plan";
import { type RequestRowData } from "../../../components/requests/request-parts";
import { useRequestOptions } from "../../../components/requests/use-request-options";

/** useRequestsScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useRequestsScreenData() {
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

  return {
    user,
    amazen,
    c,
    tabSafe,
    toast,
    t,
    locale,
    wide,
    leave,
    requests,
    schedule,
    isLoading,
    isRefreshing,
    error,
    fetchData,
    options,
    offered,
    leaveOffered,
    otherKinds,
    today,
    tourScroll,
    viewYear,
    setViewYear,
    viewMonth,
    setViewMonth,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    isSelecting,
    setIsSelecting,
    availabilityCache,
    isLoadingAvailability,
    availabilityError,
    leaveType,
    setLeaveType,
    notes,
    setNotes,
    isSubmitting,
    setIsSubmitting,
    chooserOpen,
    setChooserOpen,
    formKind,
    setFormKind,
    formInitial,
    setFormInitial,
    requestFilter,
    setRequestFilter,
    detail,
    setDetail,
    scheduleDays,
    approvedDates,
    pendingDates,
    spaceName,
    handleRefresh,
    canSeeTeamAvailability,
    goToPrevMonth,
  };
}
