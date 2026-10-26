import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Dimensions, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../lib/constants';
import { isSameDay } from '../lib/utils';
import { type DatePickerModalProps, getMonthGrid, styles } from './date-picker-modal-parts';

export function DatePickerModal({
  visible,
  selectedDate,
  onSelect,
  onClear,
  onClose,
  minDate,
  maxDate,
  title,
}: DatePickerModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const displayTitle = title ?? t('components.datePicker.selectDate');
  const MONTH_NAMES = t('monthNames', { returnObjects: true }) as string[];
  const DAY_HEADERS = t('dayNames.headers', { returnObjects: true }) as string[];
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

  /*
    Open on the CHOSEN month, every time. The modal stays mounted while hidden,
    so the view was set once from the first value it ever saw — a date read off
    a receipt afterwards, or a second field sharing the screen, opened on a
    month nobody had picked.
  */
  useEffect(() => {
    if (!visible) return;
    const anchor = selectedDate ?? new Date();
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
    setPane('days');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const goToPrevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const handleSelect = useCallback(
    (date: Date) => {
      onSelect(date);
      onClose();
    },
    [onSelect, onClose],
  );

  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const minDateStart = minDate ? dayStart(minDate) : null;
  const maxDateStart = maxDate ? dayStart(maxDate) : null;

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
              <Icon name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Month Navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn} activeOpacity={0.6}>
              <Icon name="backLine" size={20} color={colors.textSecondary} />
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
              <Icon name={pane === 'days' ? 'chevronDown' : 'chevronUp'} size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToNextMonth} style={styles.navBtn} activeOpacity={0.6}>
              <Icon name="chevronRight" size={20} color={colors.textSecondary} />
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
                  onPress={() => {
                    setViewYear(y);
                    setPane('months');
                  }}
                  style={[styles.paneCell, y === viewYear && { backgroundColor: COLORS.primary }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.paneText, { color: y === viewYear ? '#fff' : colors.textPrimary }]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {pane === 'months' && (
            <View style={styles.paneGrid}>
              {MONTH_NAMES.map((name, i) => (
                <TouchableOpacity
                  key={name}
                  onPress={() => {
                    setViewMonth(i);
                    setPane('days');
                  }}
                  style={[styles.paneCell, i === viewMonth && { backgroundColor: COLORS.primary }]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.paneText, { color: i === viewMonth ? '#fff' : colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {name.slice(0, 3)}
                  </Text>
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
                    const outOfRange =
                      (minDateStart !== null && date < minDateStart) || (maxDateStart !== null && date > maxDateStart);
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
                        disabled={outOfRange}
                        activeOpacity={0.6}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            { color: colors.textPrimary },
                            outOfRange && { color: colors.borderLight, opacity: 0.4 },
                            isWeekend && !outOfRange && !isSelected && { color: colors.textMuted },
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
              // Not offered when today itself is outside the allowed range — a
              // shortcut to a day the calendar refuses is worse than no shortcut.
              disabled={
                (minDateStart !== null && dayStart(today) < minDateStart) ||
                (maxDateStart !== null && dayStart(today) > maxDateStart)
              }
              onPress={() => {
                handleSelect(today);
              }}
              style={[styles.todayBtn, { backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9' }]}
              activeOpacity={0.7}
            >
              <Icon name="calendar" size={16} color={COLORS.primary} />
              <Text style={[styles.todayBtnText, { color: COLORS.primary }]}>{t('components.datePicker.today')}</Text>
            </TouchableOpacity>

            {selectedDate && onClear && (
              <TouchableOpacity
                onPress={() => {
                  onClear();
                  onClose();
                }}
                style={styles.clearBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.clearBtnText, { color: colors.textMuted }]}>
                  {t('components.datePicker.clear')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
