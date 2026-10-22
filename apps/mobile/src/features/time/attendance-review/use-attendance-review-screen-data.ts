import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { useAuth } from '@/contexts/auth-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { attendanceApi, type NoShow } from '@/lib/api';
import type { TimeEntry } from '@/lib/api/types';
import { holds } from '@/lib/permissions';
import { type Segment, type Period, PAGE, NO_SHOW_DAYS, type Feed, dayISO } from './attendance-review-helpers';
import { caught } from '@/lib/caught';

/** The review's state, loading and paging — the first half of `useAttendanceReviewScreen`, moved here unchanged. */
export function useAttendanceReviewScreenData() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const { formatTime, formatDateRelative } = useTimeFormat();

  /*
    May they DECIDE, CORRECT, or only look?

    Three separate grants, and the endpoints enforce exactly this split:
    `canViewSpaceAttendance` reads the lists, `canApproveAttendance` approves or
    rejects a shift (a sign-off — a client's supervisor holds it), and
    `canReconcileAttendance` corrects one: edits its times, excuses a no-show.
    Each button follows the grant its own route asks, so a supervisor who signs
    off our hours is never offered a correction the server would refuse.
  */
  const canCorrect = holds(user, 'canReconcileAttendance');

  const [segment, setSegment] = useState<Segment>('records');
  const [period, setPeriod] = useState<Period>('today');
  const [search, setSearch] = useState('');
  /* A range the reader picked themselves — two calendar days, inclusive. */
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [pickingRange, setPickingRange] = useState<'from' | 'to' | null>(null);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [records, setRecords] = useState<Feed<TimeEntry> | null>(null);
  const [noShows, setNoShows] = useState<Feed<NoShow> | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /** One Date for the calendars, so they do not re-render on every keystroke. */
  const TODAY = useMemo(() => new Date(), []);
  /*
    Where the range picker goes after this pick.

    The calendar closes itself after a selection — it calls `onSelect` and then
    `onClose`, in that order. Setting the second step inside `onSelect` was
    therefore undone a line later by the close handler, so choosing From simply
    shut the calendar and To was never asked for. The step is parked here and
    read by `onClose`, which is the one that runs last.
  */
  const nextRangeStepRef = useRef<'to' | null>(null);

  const lastLoadedRef = useRef<Record<Segment, number>>({ records: 0, noshows: 0 });
  const feedOf = { records, noshows: noShows }[segment];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /*
    Which days the History tab is asking about.

    The endpoint takes either a single `date` or a `startDate`/`endDate` pair,
    so "today" stays a one-day query rather than a range of length one — the
    same request the dashboard makes, and the cheaper index for it.
  */
  const rangeParams = useCallback(() => {
    if (period === 'today') return { date: dayISO(0) };
    if (period === 'custom') {
      // Until both ends are chosen, a custom range has nothing to ask about —
      // showing the last 30 days under a "Custom" chip would be a lie.
      if (!customFrom || !customTo) return null;
      return { startDate: customFrom, endDate: customTo };
    }
    return { startDate: dayISO(period === 'week' ? 6 : 29), endDate: dayISO(0) };
  }, [period, customFrom, customTo]);

  const fetchPage = useCallback(
    async (which: Segment, page: number) => {
      if (which === 'records') {
        const range = rangeParams();
        if (!range) return [] as TimeEntry[];
        return attendanceApi.getAllEntries({
          ...range,
          search: debouncedSearch || undefined,
          page,
          limit: PAGE,
        });
      }
      // No-shows are a fixed window of a few days, and arrive whole.
      return attendanceApi.listNoShows(NO_SHOW_DAYS);
    },
    [rangeParams, debouncedSearch],
  );

  // The segment decides which kind of row the feed holds (fetchPage reads the same segment).
  const setFeed = useCallback((which: Segment, feed: Feed<TimeEntry | NoShow> | null) => {
    if (which === 'records') setRecords(feed as Feed<TimeEntry> | null);
    else setNoShows(feed as Feed<NoShow> | null);
  }, []);

  /*
    One segment, one request, and only when it is actually looked at.

    Loading all three up front would fire three queries over the same table for
    a screen that shows one of them — and the approvals queue is the one people
    open. A segment already fetched is kept, so switching back is instant; pull
    to refresh, or leave for half a minute, and it asks again.
  */
  const load = useCallback(
    async (which: Segment, mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setIsRefreshing(true);
      else setIsLoading(true);
      try {
        const rows = await fetchPage(which, 1);
        setFeed(which, { rows, page: 1, done: rows.length < PAGE });
        lastLoadedRef.current[which] = Date.now();
      } catch (err: unknown) {
        if (caught(err).statusCode === 401) return;
        toast.error(t('common.error'), caught(err).message || t('attendanceReview.failedToLoad'));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fetchPage, setFeed, t, toast],
  );

  /*
    More rows when the reader reaches the end of what they have.

    A fixed limit would be a silent cap: thirty rows shown, the rest invisible,
    and a screen that looks finished when it is not. A month of attendance for a
    real crew is hundreds of shifts.
  */
  const loadMore = useCallback(async () => {
    const feed = feedOf;
    if (!feed || feed.done || loadingMore || isLoading || segment === 'noshows') return;
    const next = feed.page + 1;
    setLoadingMore(true);
    try {
      const more = await fetchPage(segment, next);
      setFeed(segment, { rows: [...feed.rows, ...more], page: next, done: more.length < PAGE });
    } catch {
      // A failed page is not worth a toast — pull-to-refresh is right there.
    } finally {
      setLoadingMore(false);
    }
  }, [feedOf, loadingMore, isLoading, segment, fetchPage, setFeed]);

  const show = useCallback(
    (which: Segment) => {
      setSegment(which);
      const feed = { records, noshows: noShows }[which];
      if (feed === null) load(which);
    },
    [load, records, noShows],
  );

  // A different window or a different name is a different question — ask it,
  // from the first page.
  useEffect(() => {
    if (records === null) return; // History has not been opened yet.
    load('records');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, debouncedSearch, customFrom, customTo]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedRef.current[segment] < 30000) return;
      load(segment);
    }, [segment, load]),
  );
  return {
    colors,
    t,
    insets,
    toast,
    user,
    formatTime,
    formatDateRelative,
    canCorrect,
    segment,
    setSegment,
    period,
    setPeriod,
    search,
    setSearch,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    pickingRange,
    setPickingRange,
    editing,
    setEditing,
    debouncedSearch,
    setDebouncedSearch,
    records,
    setRecords,
    noShows,
    setNoShows,
    isLoading,
    setIsLoading,
    isRefreshing,
    setIsRefreshing,
    loadingMore,
    setLoadingMore,
    TODAY,
    nextRangeStepRef,
    lastLoadedRef,
    feedOf,
    rangeParams,
    fetchPage,
    setFeed,
    load,
    loadMore,
    show,
  };
}
