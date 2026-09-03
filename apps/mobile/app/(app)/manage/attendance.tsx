import { useState, useCallback, useMemo, useRef } from 'react';
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

type Segment = 'approvals' | 'today' | 'noshows';
/** One screenful and a bit — the queue pages in as it is read. */
const PAGE = 30;
const SEGMENTS: Segment[] = ['approvals', 'today', 'noshows'];

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
  const [pending, setPending] = useState<TimeEntry[] | null>(null);
  const [today, setToday] = useState<TimeEntry[] | null>(null);
  const [noShows, setNoShows] = useState<NoShow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /* Approvals page in; the rest are a day and a week, which arrive whole. */
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingExhausted, setPendingExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<TimeEntry | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const lastLoadedRef = useRef<Record<Segment, number>>({ approvals: 0, today: 0, noshows: 0 });

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
      if (which === 'approvals') {
        const first = await attendanceApi.getPendingApprovals({ page: 1, limit: PAGE });
        setPending(first);
        setPendingPage(1);
        setPendingExhausted(first.length < PAGE);
      }
      else if (which === 'today') setToday(await attendanceApi.getAllEntries({ date: todayISO() }));
      else setNoShows(await attendanceApi.listNoShows(7));
      lastLoadedRef.current[which] = Date.now();
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      toast.error(t('common.error'), err?.message || t('attendanceReview.failedToLoad'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t, toast]);

  /*
    More of the queue, when the reader reaches the end of what they have.

    A fixed limit would have been a silent cap: thirty decisions shown, the rest
    invisible, and a screen that looks finished when it is not.
  */
  const loadMorePending = useCallback(async () => {
    if (segment !== 'approvals' || pendingExhausted || loadingMore || isLoading) return;
    const next = pendingPage + 1;
    setLoadingMore(true);
    try {
      const more = await attendanceApi.getPendingApprovals({ page: next, limit: PAGE });
      setPending((list) => [...(list || []), ...more]);
      setPendingPage(next);
      if (more.length < PAGE) setPendingExhausted(true);
    } catch {
      // A failed page is not worth a toast — the pull-to-refresh is right there.
    } finally {
      setLoadingMore(false);
    }
  }, [segment, pendingExhausted, loadingMore, isLoading, pendingPage]);

  const show = useCallback((which: Segment) => {
    setSegment(which);
    const loaded = { approvals: pending, today, noshows: noShows }[which];
    if (loaded === null) load(which);
  }, [load, pending, today, noShows]);

  useFocusEffect(useCallback(() => {
    if (Date.now() - lastLoadedRef.current[segment] < 30000) return;
    load(segment);
  }, [segment, load]));

  // ── Decisions ─────────────────────────────────────────────────────────────

  const approve = useCallback(async (entry: TimeEntry) => {
    setBusyId(entry.id);
    try {
      await attendanceApi.approveEntry(entry.id);
      // Drop it from the queue rather than refetching the page: the decision is
      // made, and a member watching a list they just acted on should see it go.
      setPending((list) => (list || []).filter((e) => e.id !== entry.id));
      toast.success(t('attendanceReview.approved'));
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('attendanceReview.failedToApprove'));
    } finally {
      setBusyId(null);
    }
  }, [t, toast]);

  const confirmReject = useCallback(async () => {
    const entry = rejectTarget;
    const reason = rejectReason.trim();
    if (!entry || !reason) return;
    setRejectTarget(null);
    setRejectReason('');
    setBusyId(entry.id);
    try {
      await attendanceApi.rejectEntry(entry.id, reason);
      setPending((list) => (list || []).filter((e) => e.id !== entry.id));
      toast.success(t('attendanceReview.rejected'));
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('attendanceReview.failedToReject'));
    } finally {
      setBusyId(null);
    }
  }, [rejectTarget, rejectReason, t, toast]);

  const excuse = useCallback(async (row: NoShow) => {
    setBusyId(row.id);
    try {
      await attendanceApi.resolveNoShow(row.id, 'excuse');
      setNoShows((list) => (list || []).filter((n) => n.id !== row.id));
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
    (e as unknown as { timezone?: string | null; location?: { timezone?: string | null } }).timezone ??
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

  // On the clock first — the people still working are the ones a decision might
  // still affect today.
  const todaySorted = useMemo(() => {
    const list = today || [];
    return [...list].sort((a, b) => {
      const openA = a.clockOutAt ? 1 : 0;
      const openB = b.clockOutAt ? 1 : 0;
      if (openA !== openB) return openA - openB;
      return new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime();
    });
  }, [today]);

  const rows: (TimeEntry | NoShow)[] =
    segment === 'approvals' ? (pending || []) : segment === 'today' ? todaySorted : (noShows || []);

  const emptyCopy = {
    approvals: { icon: 'checkmark-done-outline' as const, text: t('attendanceReview.empty.approvals') },
    today: { icon: 'time-outline' as const, text: t('attendanceReview.empty.today') },
    noshows: { icon: 'happy-outline' as const, text: t('attendanceReview.empty.noshows') },
  }[segment];

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <View style={s.filterRow}>
        {SEGMENTS.map((seg) => (
          <FilterChip
            key={seg}
            label={
              seg === 'approvals' && pending?.length
                ? `${t('attendanceReview.segments.approvals')} (${pending.length})`
                : t(`attendanceReview.segments.${seg}`)
            }
            active={segment === seg}
            onPress={() => show(seg)}
          />
        ))}
      </View>

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
            // The queue is short by nature; these keep a long day's records
            // from mounting every row at once.
            initialNumToRender={8}
            windowSize={7}
            removeClippedSubviews
            onEndReached={loadMorePending}
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

/** Today in the device's own zone — the query is a calendar day, not an instant. */
function todayISO(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
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
