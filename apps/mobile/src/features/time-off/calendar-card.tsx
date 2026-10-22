import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { LeaveLegend } from '../time/time-off-section-shared';
import { isSameDay } from '../../lib/utils';
import { AText, Well, SectionLabel } from '../../components/amazen';
import { getMonthGrid, isDateInRange, toDateString } from './helpers';

/**
 * The month — where LEAVE is asked for: the member's own leave marked, off days
 * dimmed, the picked range drawn. Tap a first day, then a last day; tapping a
 * day is the parent's decision (`onDayPress`). The interaction members already
 * know, in the v2 look of the Time tab's month (`time-off-section.tsx`).
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
  const { t, i18n } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  const monthGrid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const hasRangeSelected = rangeStart !== null && rangeEnd !== null;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const navBtn = {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.tile,
  };

  return (
    <Well style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
      <SectionLabel>{t('requests.leaveSection', 'Leave')}</SectionLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        <Pressable
          onPress={onPrevMonth}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('time.off.prevMonth', 'Previous month')}
          style={navBtn}>
          <AText variant="body" tone="strong">‹</AText>
        </Pressable>
        <Pressable onPress={onToday} accessibilityRole="button" style={{ flex: 1 }}>
          <AText variant="body" tone="strong" style={{ textAlign: 'center', fontSize: 15 }}>
            {new Date(viewYear, viewMonth, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
          </AText>
        </Pressable>
        <Pressable
          onPress={onNextMonth}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('time.off.nextMonth', 'Next month')}
          style={navBtn}>
          <AText variant="body" tone="strong">›</AText>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <AText
            key={i}
            variant="caption"
            tone="muted"
            numeric
            style={{ flex: 1, textAlign: 'center', fontSize: 10.5 }}
          >
            {t(`dayNames.short.${i}`)}
          </AText>
        ))}
      </View>

      <View style={{ gap: 3 }}>
        {monthGrid.map((week, rowIdx) => (
          <View key={rowIdx} style={{ flexDirection: 'row' }}>
            {week.map((date, colIdx) => {
              if (!date) return <View key={colIdx} style={{ flex: 1, height: 40 }} />;
              const ds = toDateString(date);
              const isPast = date < todayStart;
              // 0 = Mon … 6 = Sun, the schedule's numbering.
              const isScheduled = scheduleLength === 0 || scheduleDays[colIdx] === true;
              const approved = !!approvedDates[ds];
              const pending = !!pendingDates[ds];
              const inRange = hasRangeSelected && isDateInRange(date, rangeStart!, rangeEnd!);
              const edge = (!!rangeStart && isSameDay(date, rangeStart)) || (!!rangeEnd && isSameDay(date, rangeEnd));
              const disabled = isPast || !isScheduled;
              const isToday = isSameDay(date, today);
              return (
                <View key={colIdx} style={{ flex: 1, padding: 1.5 }}>
                  <Pressable
                    onPress={() => onDayPress(date)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: inRange || edge, disabled }}
                    accessibilityLabel={date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                    style={{
                      height: 38, borderRadius: edge ? 12 : 8, alignItems: 'center', justifyContent: 'center',
                      backgroundColor:
                        edge && isScheduled
                          ? c.accentSolid
                          : inRange && isScheduled
                            ? c.accentTint
                            : approved
                              ? c.accentTint
                              : 'transparent',
                      borderWidth: pending && !edge ? 1.5 : isToday && !edge && !inRange ? 1 : 0,
                      borderColor: pending ? c.warn : c.lineField,
                    }}
                  >
                    <AText
                      variant="caption"
                      numeric
                      style={{
                        fontSize: 13.5,
                        color: edge && isScheduled ? c.accentInk : approved ? c.accent : isToday ? c.accent : c.inkStrong,
                        opacity: isPast ? 0.3 : !isScheduled ? 0.4 : 1,
                      }}
                    >
                      {date.getDate()}
                    </AText>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <LeaveLegend
        amazen={amazen}
        approved={t('timeOff.calendar.legend.approved')}
        waiting={t('timeOff.calendar.legend.pending')}
        off={scheduleLength > 0 ? t('timeOff.calendar.legend.offDay') : null}
        offOpacity={0.4}
      />

      <AText variant="caption" tone="muted" style={{ textAlign: 'center', fontSize: 12 }}>
        {isSelecting && rangeStart && !rangeEnd
          ? t('timeOff.calendar.selectionHint')
          : !rangeStart
            ? t('time.off.hintFirst', 'Tap your first day off')
            : ' '}
      </AText>
    </Well>
  );
}
