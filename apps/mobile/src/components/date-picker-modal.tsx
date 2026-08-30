import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../lib/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_SIZE = Math.floor((SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md * 2) / 7);

// MONTH_NAMES and DAY_HEADERS are now derived from translations inside the component

interface DatePickerModalProps {
  visible: boolean;
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  onClear: () => void;
  onClose: () => void;
  minDate?: Date;
  title?: string;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
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
    if (week.every(d => d === null) && row >= 4) break;
    grid.push(week);
  }
  return grid;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DatePickerModal({
  visible,
  selectedDate,
  onSelect,
  onClear,
  onClose,
  minDate,
  title,
}: DatePickerModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const displayTitle = title ?? t('components.datePicker.selectDate');
  const MONTH_NAMES = t('monthNames', { returnObjects: true }) as string[];
  const DAY_HEADERS = (t('dayNames.headers', { returnObjects: true }) as string[]);
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() ?? today.getMonth());
  /*
    Three panes, not one.

    A month grid with only arrows is fine for "next Tuesday" and useless for a
    passport that expires in 2035 — that is over a hundred taps, one month at a
    time. Tapping the title opens years, choosing a year opens months, and
    choosing a month returns to the days. Two taps instead of a hundred.
  */
  const [pane, setPane] = useState<'days' | 'months' | 'years'>('days');

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const goToPrevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  }, [viewMonth]);

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  }, [viewMonth]);

  const handleSelect = useCallback((date: Date) => {
    onSelect(date);
    onClose();
  }, [onSelect, onClose]);

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const minDateStart = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : todayStart;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>

      <View style={styles.centeredContainer} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a2e' : '#ffffff' }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{displayTitle}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Month Navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn} activeOpacity={0.6}>
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPane((p) => (p === 'days' ? 'years' : 'days'))}
              style={styles.monthLabelBtn}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <Ionicons
                name={pane === 'days' ? 'chevron-down' : 'chevron-up'}
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToNextMonth} style={styles.navBtn} activeOpacity={0.6}>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {pane === 'years' && (
            <ScrollView style={styles.pane} contentContainerStyle={styles.paneGrid}>
              {/*
                A window around today, not every year there has ever been. These
                documents expire within a working lifetime, and a list that
                starts at 1900 is a list nobody can scroll.
              */}
              {Array.from({ length: 41 }, (_, i) => today.getFullYear() - 10 + i).map((y) => (
                <TouchableOpacity
                  key={y}
                  onPress={() => { setViewYear(y); setPane('months'); }}
                  style={[
                    styles.paneCell,
                    y === viewYear && { backgroundColor: COLORS.primary },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.paneText,
                    { color: y === viewYear ? '#fff' : colors.textPrimary },
                  ]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {pane === 'months' && (
            <View style={styles.paneGrid}>
              {MONTH_NAMES.map((name, i) => (
                <TouchableOpacity
                  key={name}
                  onPress={() => { setViewMonth(i); setPane('days'); }}
                  style={[
                    styles.paneCell,
                    i === viewMonth && { backgroundColor: COLORS.primary },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.paneText,
                    { color: i === viewMonth ? '#fff' : colors.textPrimary },
                  ]} numberOfLines={1}>{name.slice(0, 3)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {pane === 'days' && (
          <>
          {/* Day Headers */}
          <View style={styles.dayHeaderRow}>
            {DAY_HEADERS.map((d, i) => (
              <View key={i} style={styles.dayHeaderCell}>
                <Text style={[styles.dayHeaderText, { color: colors.textMuted }]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          {grid.map((week, rowIdx) => (
            <View key={rowIdx} style={styles.weekRow}>
              {week.map((date, colIdx) => {
                if (!date) {
                  return <View key={colIdx} style={styles.dayCell} />;
                }

                const isToday = isSameDay(date, today);
                const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                const isPast = date < minDateStart;
                const isWeekend = colIdx >= 5;

                return (
                  <TouchableOpacity
                    key={colIdx}
                    style={[
                      styles.dayCell,
                      isSelected && [styles.dayCellSelected, { backgroundColor: COLORS.primary }],
                      isToday && !isSelected && [styles.dayCellToday, { borderColor: COLORS.primary }],
                    ]}
                    onPress={() => handleSelect(date)}
                    disabled={isPast}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        { color: colors.textPrimary },
                        isPast && { color: colors.borderLight, opacity: 0.4 },
                        isWeekend && !isPast && !isSelected && { color: colors.textMuted },
                        isSelected && { color: '#ffffff', fontWeight: FONT_WEIGHT.bold },
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          </>
          )}

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => { handleSelect(today); }}
              style={[styles.todayBtn, { backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9' }]}
              activeOpacity={0.7}
            >
              <Ionicons name="today-outline" size={16} color={COLORS.primary} />
              <Text style={[styles.todayBtnText, { color: COLORS.primary }]}>{t('components.datePicker.today')}</Text>
            </TouchableOpacity>

            {selectedDate && (
              <TouchableOpacity
                onPress={() => { onClear(); onClose(); }}
                style={styles.clearBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.clearBtnText, { color: colors.textMuted }]}>{t('components.datePicker.clear')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  pane: { maxHeight: DAY_SIZE * 5 },
  paneGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    paddingVertical: SPACING.sm, gap: SPACING.xs,
  },
  paneCell: {
    width: DAY_SIZE * 1.6, paddingVertical: SPACING.sm,
    alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md,
  },
  paneText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  monthLabel: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  dayHeaderText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    maxHeight: 44,
  },
  dayCellSelected: {
    borderRadius: RADIUS.full,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderRadius: RADIUS.full,
  },
  dayText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  todayBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  clearBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  clearBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
});
