import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';
import { attendanceApi, type NoShow } from '../../../src/lib/api';
import type { TimeEntry } from '../../../src/lib/api/types';
import { workedMinutes } from '@hbcfield/shared/client';
import { formatDurationMinutes } from '../../../src/lib/utils';
import { holds } from '../../../src/lib/permissions';
import { FilterChip } from '../../../src/components/filter-chip';
import { Skeleton, ScreenContainer, BlurSheet, SheetPanel } from '../../../src/components';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../../src/lib/constants';

/**
 * Attendance review on the phone — the web `/attendance` page's working half.
 *
 * Mobile had no attendance management at all: the Clock tab is the member's OWN
 * shift, and Manage held everything except the one thing a shift leader spends
 * their week on. Whoever holds the permission got the whole feature only at a
 * desk.
 *
 * Every read here is `@RequirePermissionInSpace`, so the SERVER decides how much
 * of the organization the answer covers — the whole org for an admin, one site
 * for its supervisor, from the identical request. Nothing is filtered here, and
 * no screen asks who somebody is: it asks what they may do.
 *
 * Deliberately not ported: editing an entry's times. That is a 600-line dialog
 * on web with per-entry timezone arithmetic and an audit trail, and correcting
 * somebody's hours by thumb is where a mistake gets made. Approve, reject and
 * excuse are the decisions; the corrections stay at a desk.
 */

type Segment = 'approvals' | 'records' | 'noshows';
type Period = 'today' | 'week' | 'month';

const SEGMENTS: Segment[] = ['approvals', 'records', 'noshows'];
const PERIODS: Period[] = ['today', 'week', 'month'];
/** One screenful and a bit — every list pages in as it is read. */
const PAGE = 30;
/** How far back the no-show sweep looks, matching the web default. */
const NO_SHOW_DAYS = 7;

/** Auto-approval flags, coloured by how much attention each deserves. */
const FLAG_COLOR: Record<string, string> = {
  MISSED_CLOCK_OUT: '#ef4444',
  OVERTIME: '#f97316',
  OUTSIDE_GEOFENCE_IN: '#f59e0b',
  OUTSIDE_GEOFENCE_OUT: '#f59e0b',
  LATE_ARRIVAL: '#eab308',
  EARLY_DEPARTURE: '#eab308',
  UNSCHEDULED_DAY: '#a855f7',
};

/** A list plus where it has got to. `done` means the server has no more rows. */
interface Feed<T> {
  rows: T[];
  page: number;
  done: boolean;
}

export default function AttendanceReviewScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { formatTime, formatDateRelative } = useTimeFormat();

  /*
    May they DECIDE, or only look?

    Viewing and reconciling are separate grants — a Team Leader sees their
    space's attendance and approves overtime but does not close entries. The
    endpoints enforce exactly this split (`canViewSpaceAttendance` to read,
    `canReconcileAttendance` to approve/reject/excuse), so the buttons follow
    the second one and the lists follow the first.
  */
  const canDecide = holds(user, 'canReconcileAttendance');

  const [segment, setSegment] = useState<Segment>('approvals');
  const [period, setPeriod] = useState<Period>('today');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [approvals, setApprovals] = useState<Feed<TimeEntry> | null>(null);
  const [records, setRecords] = useState<Feed<TimeEntry> | null>(null);
  const [noShows, setNoShows] = useState<Feed<NoShow> | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TimeEntry | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const lastLoadedRef = useRef<Record<Segment, number>>({ approvals: 0, records: 0, noshows: 0 });
  const feedOf = { approvals, records, noshows: noShows }[segment];

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
    return { startDate: dayISO(period === 'week' ? 6 : 29), endDate: dayISO(0) };
  }, [period]);

  const fetchPage = useCallback(async (which: Segment, page: number) => {
    if (which === 'approvals') return attendanceApi.getPendingApprovals({ page, limit: PAGE });
    if (which === 'records') {
      return attendanceApi.getAllEntries({
        ...rangeParams(),
        search: debouncedSearch || undefined,
        page,
        limit: PAGE,
      });
    }
    // No-shows are a fixed window of a few days, and arrive whole.
    return attendanceApi.listNoShows(NO_SHOW_DAYS);
  }, [rangeParams, debouncedSearch]);

  const setFeed = useCallback((which: Segment, feed: Feed<any> | null) => {
    if (which === 'approvals') setApprovals(feed);
    else if (which === 'records') setRecords(feed);
    else setNoShows(feed);
  }, []);

  /*
    One segment, one request, and only when it is actually looked at.

    Loading all three up front would fire three queries over the same table for
    a screen that shows one of them — and the approvals queue is the one people
    open. A segment already fetched is kept, so switching back is instant; pull
    to refresh, or leave for half a minute, and it asks again.
  */
  const load = useCallback(async (which: Segment, mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const rows = await fetchPage(which, 1);
      setFeed(which, { rows, page: 1, done: rows.length < PAGE });
      lastLoadedRef.current[which] = Date.now();
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      toast.error(t('common.error'), err?.message || t('attendanceReview.failedToLoad'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchPage, setFeed, t, toast]);

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

  const show = useCallback((which: Segment) => {
    setSegment(which);
    const feed = { approvals, records, noshows: noShows }[which];
    if (feed === null) load(which);
  }, [load, approvals, records, noShows]);

  // A different window or a different name is a different question — ask it,
  // from the first page.
  useEffect(() => {
    if (records === null) return; // History has not been opened yet.
    load('records');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, debouncedSearch]);

  useFocusEffect(useCallback(() => {
    if (Date.now() - lastLoadedRef.current[segment] < 30000) return;
    load(segment);
  }, [segment, load]));

  // ── Decisions ─────────────────────────────────────────────────────────────

  /** Drop a decided row from every list holding it, without refetching. */
  const forget = useCallback((id: string) => {
    setApprovals((f) => (f ? { ...f, rows: f.rows.filter((e) => e.id !== id) } : f));
  }, []);

  const approve = useCallback(async (entry: TimeEntry) => {
    setBusyId(entry.id);
    try {
      await attendanceApi.approveEntry(entry.id);
      forget(entry.id);
      toast.success(t('attendanceReview.approved'));
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('attendanceReview.failedToApprove'));
    } finally {
      setBusyId(null);
    }
  }, [forget, t, toast]);

  const confirmReject = useCallback(async () => {
    const entry = rejectTarget;
    const reason = rejectReason.trim();
    if (!entry || !reason) return;
    setRejectTarget(null);
    setRejectReason('');
    setBusyId(entry.id);
    try {
      await attendanceApi.rejectEntry(entry.id, reason);
      forget(entry.id);
      toast.success(t('attendanceReview.rejected'));
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('attendanceReview.failedToReject'));
    } finally {
      setBusyId(null);
    }
  }, [rejectTarget, rejectReason, forget, t, toast]);

  const excuse = useCallback(async (row: NoShow) => {
    setBusyId(row.id);
    try {
      await attendanceApi.resolveNoShow(row.id, 'excuse');
      setNoShows((f) => (f ? { ...f, rows: f.rows.filter((n) => n.id !== row.id) } : f));
      toast.success(t('attendanceReview.excused'));
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('attendanceReview.failedToExcuse'));
    } finally {
      setBusyId(null);
    }
  }, [t, toast]);

  // ── Rows ──────────────────────────────────────────────────────────────────

  const memberName = (e: TimeEntry) => {
    const u = (e as unknown as { user?: { firstName?: string; lastName?: string } }).user;
    return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : t('attendanceReview.someone');
  };
  const spaceName = (e: TimeEntry) =>
    (e as unknown as { location?: { name?: string } }).location?.name ?? '';
  /*
    The zone the entry HAPPENED in, not the reader's.

    An entry carries the timezone captured at clock-in, with the space's zone
    behind it. Rendering a shift in the phone's zone would tell a supervisor
    abroad that their crew started at four in the morning.
  */
  const zoneOf = (e: TimeEntry) =>
    (e as unknown as { timezone?: string | null }).timezone ??
    (e as unknown as { location?: { timezone?: string | null } }).location?.timezone ??
    undefined;

  const Flags = ({ reasons }: { reasons?: string[] }) => {
    if (!reasons?.length) return null;
    return (
      <View style={s.flagRow}>
        {reasons.map((r) => {
          const color = FLAG_COLOR[r] ?? colors.textMuted;
          return (
            <View key={r} style={[s.flag, { backgroundColor: color + '1f', borderColor: color + '55' }]}>
              <Text style={[s.flagText, { color }]}>{t(`attendanceReview.flags.${r}`, r)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  /** Where a past shift ended up: approved, sent back, or still waiting. */
  const Outcome = ({ entry }: { entry: TimeEntry }) => {
    const status = entry.approvalStatus;
    if (!status) return null;
    const color = status === 'APPROVED' ? '#22c55e' : status === 'REJECTED' ? COLORS.error : '#f59e0b';
    return (
      <View style={[s.flag, { backgroundColor: color + '1f', borderColor: color + '55' }]}>
        <Text style={[s.flagText, { color }]}>{t(`attendanceReview.outcome.${status}`, status)}</Text>
      </View>
    );
  };

  const EntryCard = ({ entry, decidable }: { entry: TimeEntry; decidable: boolean }) => {
    const tz = zoneOf(entry);
    const open = !entry.clockOutAt;
    const busy = busyId === entry.id;
    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={s.cardInfo}>
            <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>{memberName(entry)}</Text>
            <Text style={[s.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatDateRelative(entry.clockInAt, tz)}
              {spaceName(entry) ? ` · ${spaceName(entry)}` : ''}
            </Text>
          </View>
          <Text style={[s.duration, { color: colors.textPrimary }]}>
            {open ? t('attendanceReview.onTheClock') : formatDurationMinutes(workedMinutes(entry))}
          </Text>
        </View>

        <View style={s.timesRow}>
          <Ionicons name="log-in-outline" size={14} color={colors.textMuted} />
          <Text style={[s.times, { color: colors.textSecondary }]}>{formatTime(entry.clockInAt, tz)}</Text>
          <Ionicons name="arrow-forward" size={13} color={colors.textMuted} />
          <Text style={[s.times, { color: open ? colors.textMuted : colors.textSecondary }]}>
            {entry.clockOutAt ? formatTime(entry.clockOutAt, tz) : '—'}
          </Text>
        </View>

        <View style={s.flagRow}>
          {/* History says how each shift ended; the queue is all pending by
              definition, so the badge would be the same word on every card. */}
          {!decidable && segment === 'records' && <Outcome entry={entry} />}
        </View>
        <Flags reasons={entry.flagReasons} />

        {!!entry.notes && (
          <Text style={[s.note, { color: colors.textMuted }]} numberOfLines={2}>{entry.notes}</Text>
        )}

        {decidable && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.actionBtn, s.rejectBtn, { borderColor: COLORS.error }]}
              onPress={() => setRejectTarget(entry)}
              disabled={busy}
            >
              <Ionicons name="close" size={16} color={COLORS.error} />
              <Text style={[s.actionBtnText, { color: COLORS.error }]}>{t('common.reject')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, s.approveBtn]} onPress={() => approve(entry)} disabled={busy}>
              {busy ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <>
                  <Ionicons name="checkmark" size={16} color={COLORS.white} />
                  <Text style={[s.actionBtnText, { color: COLORS.white }]}>{t('common.approve')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const NoShowCard = ({ row }: { row: NoShow }) => {
    const busy = busyId === row.id;
    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={s.cardInfo}>
            <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>{row.userName}</Text>
            <Text style={[s.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatDateRelative(row.expectedClockInAt)} · {row.spaceName}
            </Text>
          </View>
          {row.state === 'EXCUSED' && (
            <View style={[s.flag, { backgroundColor: '#22c55e1f', borderColor: '#22c55e55' }]}>
              <Text style={[s.flagText, { color: '#22c55e' }]}>{t('attendanceReview.excusedBadge')}</Text>
            </View>
          )}
        </View>

        <View style={s.timesRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
          <Text style={[s.times, { color: colors.textSecondary }]}>
            {t('attendanceReview.expected', {
              from: formatTime(row.expectedClockInAt),
              to: formatTime(row.expectedClockOutAt),
            })}
          </Text>
        </View>

        {!!row.excuseReason && (
          <Text style={[s.note, { color: colors.textMuted }]} numberOfLines={2}>{row.excuseReason}</Text>
        )}

        {canDecide && row.state !== 'EXCUSED' && (
          <View style={s.actions}>
            <TouchableOpacity style={[s.actionBtn, s.approveBtn]} onPress={() => excuse(row)} disabled={busy}>
              {busy ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.white} />
                  <Text style={[s.actionBtnText, { color: COLORS.white }]}>{t('attendanceReview.excuse')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // People still on the clock first: they are the ones a decision can still
  // reach today. Past days are newest-first, which is how they arrive.
  const rows: (TimeEntry | NoShow)[] = useMemo(() => {
    const list = feedOf?.rows ?? [];
    if (segment !== 'records' || period !== 'today') return list;
    return [...(list as TimeEntry[])].sort((a, b) => {
      const openA = a.clockOutAt ? 1 : 0;
      const openB = b.clockOutAt ? 1 : 0;
      if (openA !== openB) return openA - openB;
      return new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime();
    });
  }, [feedOf, segment, period]);

  const searching = segment === 'records' && !!debouncedSearch;
  const emptyCopy = {
    approvals: { icon: 'checkmark-done-outline' as const, text: t('attendanceReview.empty.approvals') },
    records: {
      icon: 'time-outline' as const,
      text: searching
        ? t('attendanceReview.empty.noMatch', { name: debouncedSearch })
        : t(`attendanceReview.empty.records.${period}`),
    },
    noshows: { icon: 'happy-outline' as const, text: t('attendanceReview.empty.noshows') },
  }[segment];

  const segmentLabel = (seg: Segment) =>
    seg === 'approvals' && approvals?.rows.length
      ? `${t('attendanceReview.segments.approvals')} (${approvals.rows.length}${approvals.done ? '' : '+'})`
      : t(`attendanceReview.segments.${seg}`);

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <View style={s.filterRow}>
        {SEGMENTS.map((seg) => (
          <FilterChip key={seg} label={segmentLabel(seg)} active={segment === seg} onPress={() => show(seg)} />
        ))}
      </View>

      {/* History is the only list worth narrowing: the queue is short by
          definition and the no-show sweep is already a fixed few days. */}
      {segment === 'records' && (
        <View style={s.controls}>
          <View style={[s.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary }]}
              value={search}
              onChangeText={setSearch}
              placeholder={t('attendanceReview.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <View style={s.periodRow}>
            {PERIODS.map((p) => (
              <FilterChip
                key={p}
                label={t(`attendanceReview.period.${p}`)}
                active={period === p}
                onPress={() => setPeriod(p)}
              />
            ))}
          </View>
        </View>
      )}

      <ScreenContainer width="content">
        {isLoading && rows.length === 0 ? (
          <Skeleton.ListScreen />
        ) : (
          <FlatList
            data={rows as any[]}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              segment === 'noshows'
                ? <NoShowCard row={item as NoShow} />
                : <EntryCard entry={item as TimeEntry} decidable={canDecide && segment === 'approvals'} />
            }
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            // A month of a real crew's shifts is hundreds of rows; these keep
            // the list from mounting all of them.
            initialNumToRender={8}
            windowSize={7}
            removeClippedSubviews
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={{ marginVertical: SPACING.lg }} color={COLORS.primary} /> : null
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => load(segment, 'refresh')}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name={emptyCopy.icon} size={40} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>{emptyCopy.text}</Text>
              </View>
            }
          />
        )}
      </ScreenContainer>

      {/* Rejecting sends the entry back to the member, so it says why. */}
      <BlurSheet visible={!!rejectTarget} onClose={() => setRejectTarget(null)}>
        <SheetPanel title={t('attendanceReview.rejectTitle')} onClose={() => setRejectTarget(null)}>
          <Text style={[s.sheetHint, { color: colors.textMuted }]}>
            {t('attendanceReview.rejectHint', { name: rejectTarget ? memberName(rejectTarget) : '' })}
          </Text>
          <TextInput
            style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            value={rejectReason}
            onChangeText={setRejectReason}
            placeholder={t('attendanceReview.rejectPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
          />
          <TouchableOpacity
            style={[s.sheetBtn, { backgroundColor: rejectReason.trim() ? COLORS.error : colors.border }]}
            onPress={confirmReject}
            disabled={!rejectReason.trim()}
          >
            <Text style={s.sheetBtnText}>{t('common.reject')}</Text>
          </TouchableOpacity>
        </SheetPanel>
      </BlurSheet>
    </View>
  );
}

/**
 * A calendar day, `back` days ago, in the device's own zone.
 *
 * The query is a date, not an instant: the server resolves each day against the
 * entry's own timezone, so what this has to send is which days the reader means.
 */
function dayISO(back: number): string {
  const d = new Date();
  d.setDate(d.getDate() - back);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  controls: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md, height: 42,
  },
  searchInput: { flex: 1, fontSize: FONT_SIZE.base, paddingVertical: 0 },
  periodRow: { flexDirection: 'row', gap: SPACING.sm },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACING.md },
  cardInfo: { flex: 1 },
  name: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  meta: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  duration: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  timesRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
  times: { fontSize: FONT_SIZE.sm },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.sm },
  flag: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.sm, borderWidth: StyleSheet.hairlineWidth },
  flagText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  note: { fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md },
  rejectBtn: { borderWidth: 1 },
  approveBtn: { backgroundColor: COLORS.primary },
  actionBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZE.base, marginTop: SPACING.md, textAlign: 'center', paddingHorizontal: SPACING.xl },
  sheetHint: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.md },
  input: {
    minHeight: 90, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md, fontSize: FONT_SIZE.base, textAlignVertical: 'top',
  },
  sheetBtn: { marginTop: SPACING.md, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  sheetBtnText: { color: '#fff', fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
});
