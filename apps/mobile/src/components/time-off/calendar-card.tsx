import { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS } from '../../lib/constants';
import { isSameDay } from '../../lib/utils';
import { TourTarget } from '../tour';
import { getMonthGrid, isDateInRange, toDateString } from './helpers';
import { styles } from './styles';

/**
 * The month: the member's own leave as dots, off days greyed, the picked
 * range highlighted. Tapping a day is the parent's decision (`onDayPress`).
 */
export function TimeOffCalendarCard({
  today,
  viewYear,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  onToday,
  scheduleLength,
  scheduleDays,
  approvedDates,
  pendingDates,
  rangeStart,
  rangeEnd,
  isSelecting,
  onDayPress,
}: {
  today: Date;
  viewYear: number;
  viewMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  scheduleLength: number;
  scheduleDays: Record<number, boolean>;
  approvedDates: Record<string, true>;
  pendingDates: Record<string, true>;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  isSelecting: boolean;
  onDayPress: (date: Date) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const monthGrid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const hasRangeSelected = rangeStart !== null && rangeEnd !== null;

  return (
    <TourTarget name="timeoff-request" style={[styles.calendarCard, { backgroundColor: colors.card }]}>
      {/* Month header */}
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onToday}>
          <Text style={[styles.calendarTitle, { color: colors.textPrimary }]}>
            {t(`monthNames.${viewMonth}`)} {viewYear}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
            const isScheduled = scheduleLength === 0 || scheduleDays[dow] === true;

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
                onPress={() => onDayPress(date)}
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
  );
}
