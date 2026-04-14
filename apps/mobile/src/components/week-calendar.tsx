import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/theme-context';
import { getWeekDays, isSameDay } from '../lib/utils';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../lib/constants';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface WeekCalendarProps {
  /** All tasks — used to compute which days have dots */
  taskDates: Set<string>;
  /** Currently selected date */
  selectedDate: Date;
  /** Called when a day is tapped */
  onSelectDate: (date: Date) => void;
  /** Current week anchor */
  currentWeekStart: Date;
  /** Navigate weeks */
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

/** Convert a Date to local YYYY-MM-DD without UTC shift */
function toLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WeekCalendar({
  taskDates,
  selectedDate,
  onSelectDate,
  currentWeekStart,
  onPrevWeek,
  onNextWeek,
  onToday,
}: WeekCalendarProps) {
  const { colors } = useTheme();
  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart]);

  return (
    <View style={calStyles.container}>
      {/* Header: month + navigation */}
      <View style={calStyles.header}>
        <Text style={[calStyles.month, { color: colors.textPrimary }]}>
          {MONTH_NAMES[currentWeekStart.getMonth()]} {currentWeekStart.getFullYear()}
        </Text>
        <View style={calStyles.nav}>
          <TouchableOpacity onPress={onPrevWeek} style={calStyles.navBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onToday} style={[calStyles.todayBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[calStyles.todayBtnText, { color: colors.textSecondary }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNextWeek} style={calStyles.navBtn}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Day boxes */}
      <View style={calStyles.weekRow}>
        {weekDays.map((weekDay, index) => {
          const selected = isSameDay(weekDay.date, selectedDate);
          const hasTasks = taskDates.has(toLocalDateStr(weekDay.date));

          return (
            <TouchableOpacity
              key={index}
              style={[calStyles.dayBox, { backgroundColor: colors.card, borderColor: colors.border }, selected && calStyles.dayBoxSelected]}
              onPress={() => onSelectDate(weekDay.date)}
              activeOpacity={0.7}
            >
              <Text style={[calStyles.dayName, { color: colors.textMuted }, selected && { color: 'rgba(255,255,255,0.7)' }]}>
                {weekDay.dayName}
              </Text>
              <Text style={[calStyles.dayNumber, { color: colors.textPrimary }, selected && { color: COLORS.white }]}>
                {weekDay.dayNumber}
              </Text>
              {hasTasks ? (
                <View style={[calStyles.dayDot, { backgroundColor: selected ? COLORS.white : COLORS.primary }]} />
              ) : (
                <View style={calStyles.dayDotPlaceholder} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  container: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  month: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  navBtn: {
    padding: SPACING.xs,
  },
  todayBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm - 2,
    borderRadius: RADIUS.sm - 2,
    borderWidth: 1,
  },
  todayBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  dayBox: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  dayBoxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  dayNumber: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    marginVertical: 10,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dayDotPlaceholder: {
    width: 6,
    height: 6,
  },
});
