import { View, Text, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../src/components';
import { type NoShow } from '../../../src/lib/api';
import type { TimeEntry } from '../../../src/lib/api/types';
import { localDateKey } from '@hbcfield/shared/client';
import { FilterChip } from '../../../src/components/filter-chip';
import { Skeleton, ScreenContainer, AttendanceEditSheet } from '../../../src/components';
import { DatePickerModal } from '../../../src/components/date-picker-modal';
import { COLORS, SPACING } from '../../../src/lib/constants';
import { SEGMENTS, PERIODS, dateFromISO, shortDay, s } from '../../../src/screens/app/manage/attendance-review-helpers';
import { useAttendanceReviewScreen } from '../../../src/screens/app/manage/use-attendance-review-screen';

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
 * Corrections are here too — a forgotten clock-out is noticed on the site, not
 * at a desk — but only the part a thumb should do: the times, the note and the
 * reason. The web dialog's breaks editor, timezone re-assignment and delete stay
 * where a mistake is easier to see and to undo.
 */

export default function AttendanceReviewScreen() {
  const {
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
  } = useAttendanceReviewScreen();

  return (
    <View style={[s.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <ScreenHeader title={t('manage.titles.attendance')} />
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
                /* The custom chip carries the days it holds, so the list never
                   shows a window whose name does not say what it is. */
                label={
                  p === 'custom' && customFrom && customTo
                    ? `${shortDay(customFrom)} – ${shortDay(customTo)}`
                    : t(`attendanceReview.period.${p}`)
                }
                active={period === p}
                onPress={() => {
                  setPeriod(p);
                  if (p === 'custom') setPickingRange('from');
                }}
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
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              segment === 'noshows' ? <NoShowCard row={item as NoShow} /> : <EntryCard entry={item as TimeEntry} />
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

      {/* Correcting the shift itself. */}
      <AttendanceEditSheet
        entry={editing}
        visible={!!editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          // Replace the row in place: the reader is looking at the list they
          // just corrected, and a refetch would scroll it out from under them.
          setRecords((f) =>
            f ? { ...f, rows: f.rows.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)) } : f,
          );
        }}
      />

      {/* Two calendar days for a custom window: from, then to. */}
      <DatePickerModal
        visible={pickingRange !== null}
        selectedDate={dateFromISO(pickingRange === 'to' ? customTo : customFrom)}
        onSelect={(d) => {
          const iso = localDateKey(d);
          if (pickingRange === 'from') {
            setCustomFrom(iso);
            // A one-day window until the second half says otherwise, so the
            // range is always answerable even if they stop here.
            if (!customTo || customTo < iso) setCustomTo(iso);
            // The second half follows immediately — a range is one intention,
            // not two errands. Handed to onClose; see nextRangeStepRef.
            nextRangeStepRef.current = 'to';
          } else {
            // Picking an end before the start would be a window with no days in
            // it; the earlier date wins and becomes the start.
            if (customFrom && iso < customFrom) {
              setCustomFrom(iso);
              setCustomTo(customFrom);
            } else {
              setCustomTo(iso);
            }
          }
        }}
        onClear={() => {
          nextRangeStepRef.current = null;
          setPickingRange(null);
        }}
        onClose={() => {
          const next = nextRangeStepRef.current;
          nextRangeStepRef.current = null;
          setPickingRange(next);
        }}
        // Attendance is always about days that have already happened; the other
        // end is open, so last year's payroll question can be asked.
        maxDate={TODAY}
        title={t(pickingRange === 'to' ? 'attendanceReview.rangeTo' : 'attendanceReview.rangeFrom')}
      />
    </View>
  );
}
