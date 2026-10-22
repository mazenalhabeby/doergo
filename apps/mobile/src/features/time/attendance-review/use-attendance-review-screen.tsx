import { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type NoShow } from '@/lib/api';
import type { TimeEntry } from '@/lib/api/types';
import {
  workedMinutes,
  personName,
  formatDuration,
  sortedLabels,
  labelWord,
  approvalText,
  approvalWord,
} from '@hbcfield/shared/client';
import i18n from '@/i18n';
import { COLORS } from '@/lib/constants';
import { router, type Href } from 'expo-router';
import { type Segment, labelColor, s } from './attendance-review-helpers';
import { useAttendanceReviewScreenData } from './use-attendance-review-screen-data';

/** AttendanceReviewScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useAttendanceReviewScreen() {
  const {
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
  } = useAttendanceReviewScreenData();

  // ── Rows ──────────────────────────────────────────────────────────────────

  const memberName = (e: TimeEntry) => {
    const u = (e as unknown as { user?: { firstName?: string; lastName?: string } }).user;
    return u ? personName(u) : t('attendanceReview.someone');
  };
  const spaceName = (e: TimeEntry) => (e as unknown as { location?: { name?: string } }).location?.name ?? '';
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
        {/* The one catalogue's order, colour and words (packages/shared/src/attendance/labels). */}
        {sortedLabels(reasons).map((l) => {
          const color = labelColor(l.tone, colors.textMuted);
          return (
            <View key={l.code} style={[s.flag, { backgroundColor: color + '1f', borderColor: color + '55' }]}>
              <Text style={[s.flagText, { color }]}>{labelWord(l.code, i18n.language)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  /** Where a past shift ended up: approved, sent back, or still waiting. */
  const Outcome = ({ entry }: { entry: TimeEntry }) => {
    if (!entry.approvalStatus) return null;
    // Same words as the web: AUTO reads "Auto-approved" in green, never the raw "AUTO".
    const word = approvalWord({ approvalStatus: entry.approvalStatus });
    const color = word === 'rejected' ? COLORS.error : word === 'needsReview' ? '#f59e0b' : '#22c55e';
    return (
      <View style={[s.flag, { backgroundColor: color + '1f', borderColor: color + '55' }]}>
        <Text style={[s.flagText, { color }]}>
          {approvalText({ approvalStatus: entry.approvalStatus }, i18n.language)}
        </Text>
      </View>
    );
  };

  const EntryCard = ({ entry }: { entry: TimeEntry }) => {
    const tz = zoneOf(entry);
    const open = !entry.clockOutAt;
    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={s.cardInfo}>
            <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {memberName(entry)}
            </Text>
            <Text style={[s.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatDateRelative(entry.clockInAt, tz)}
              {spaceName(entry) ? ` · ${spaceName(entry)}` : ''}
            </Text>
          </View>
          <Text style={[s.duration, { color: colors.textPrimary }]}>
            {open ? t('attendanceReview.onTheClock') : formatDuration(workedMinutes(entry))}
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
          {segment === 'records' && <Outcome entry={entry} />}
        </View>
        <Flags reasons={entry.flagReasons} />

        {!!entry.notes && (
          <Text style={[s.note, { color: colors.textMuted }]} numberOfLines={2}>
            {entry.notes}
          </Text>
        )}

        {/* Correcting a past shift belongs to whoever reconciles attendance —
            the same grant the endpoint enforces. */}
        {canCorrect && segment === 'records' && (
          <TouchableOpacity style={s.editRow} onPress={() => setEditing(entry)} activeOpacity={0.7}>
            <Ionicons name="create-outline" size={15} color={COLORS.primary} />
            <Text style={[s.editText, { color: COLORS.primary }]}>{t('attendanceReview.edit.button')}</Text>
            {entry.isEdited && (
              <Text style={[s.editedNote, { color: colors.textMuted }]}>{t('attendanceReview.edit.editedBadge')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const NoShowCard = ({ row }: { row: NoShow }) => {
    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={s.cardInfo}>
            <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {row.userName}
            </Text>
            <Text style={[s.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatDateRelative(row.expectedClockInAt)} · {row.spaceName}
            </Text>
          </View>
          {row.state === 'EXCUSED' && (
            <View style={[s.flag, { backgroundColor: '#22c55e1f', borderColor: '#22c55e55' }]}>
              <Text style={[s.flagText, { color: '#22c55e' }]} numberOfLines={1}>
                {row.closeReason
                  ? `${t('attendanceReview.excusedBadge')} · ${t(`attendanceReview.closeReason.${row.closeReason}`, {
                      defaultValue: row.closeReason,
                    })}`
                  : t('attendanceReview.excusedBadge')}
              </Text>
            </View>
          )}
          {row.state === 'ABSENT' && (
            <View style={[s.flag, { backgroundColor: '#ef44441f', borderColor: '#ef444455' }]}>
              <Text style={[s.flagText, { color: '#ef4444' }]}>{t('attendanceReview.absentBadge')}</Text>
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
          <Text style={[s.note, { color: colors.textMuted }]} numberOfLines={2}>
            {row.excuseReason}
          </Text>
        )}

        {/* An open one is decided in Approvals — the one place. */}
        {row.state !== 'EXCUSED' && row.state !== 'ABSENT' && (
          <TouchableOpacity
            style={s.editRow}
            onPress={() => router.push('/(app)/approvals?kind=noShow' as Href)}
            activeOpacity={0.7}
          >
            <Ionicons name="file-tray-full-outline" size={15} color={COLORS.primary} />
            <Text style={[s.editText, { color: COLORS.primary }]}>{t('approvals.decideInApprovals')}</Text>
          </TouchableOpacity>
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
    records: {
      icon: 'time-outline' as const,
      text: searching
        ? t('attendanceReview.empty.noMatch', { name: debouncedSearch })
        : t(`attendanceReview.empty.records.${period}`),
    },
    noshows: { icon: 'happy-outline' as const, text: t('attendanceReview.empty.noshows') },
  }[segment];

  const segmentLabel = (seg: Segment) => t(`attendanceReview.segments.${seg}`);

  return {
    colors,
    t,
    insets,
    segment,
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
    setRecords,
    isLoading,
    isRefreshing,
    loadingMore,
    TODAY,
    nextRangeStepRef,
    load,
    loadMore,
    show,
    EntryCard,
    NoShowCard,
    rows,
    emptyCopy,
    segmentLabel,
  };
}
