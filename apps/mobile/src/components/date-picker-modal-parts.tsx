import { StyleSheet, Dimensions } from 'react-native';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../lib/constants';

export const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const DAY_SIZE = Math.floor((SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md * 2) / 7);

// MONTH_NAMES and DAY_HEADERS are now derived from translations inside the component

export interface DatePickerModalProps {
  visible: boolean;
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  /**
   * Offer "Clear". Absent, there is no Clear — a date the record cannot be
   * without (the day a log entry happened) has nothing to be cleared TO, and a
   * button that empties it only makes the form refuse to send.
   */
  onClear?: () => void;
  onClose: () => void;
  /**
   * Earliest day that may be chosen. ABSENT MEANS NO LIMIT.
   *
   * It used to default to today, which made this picker future-only whatever it
   * was asked for — so attendance, which is always about days that have already
   * happened, opened on a month with every day greyed out and no way to say so.
   * A screen that wants "not in the past" says so; the calendar has no opinion.
   */
  minDate?: Date;
  /** Latest day that may be chosen. Absent means no limit. */
  maxDate?: Date;
  title?: string;
}

export function getMonthGrid(year: number, month: number): (Date | null)[][] {
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

export const styles = StyleSheet.create({
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
