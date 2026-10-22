import { StyleSheet } from 'react-native';
import { localDateKey, type LabelTone } from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../../lib/constants';

/** The attendance review's constants, date helpers and styles — moved here unchanged from app/(app)/manage/attendance.tsx. */
// Approving hours and excusing a missed clock-in are decided in Approvals; this screen is the record.
export type Segment = 'records' | 'noshows';

export type Period = 'today' | 'week' | 'month' | 'custom';

export const SEGMENTS: Segment[] = ['records', 'noshows'];

export const PERIODS: Period[] = ['today', 'week', 'month', 'custom'];

/** One screenful and a bit — every list pages in as it is read. */
export const PAGE = 30;

/** How far back the no-show sweep looks, matching the web default. */
export const NO_SHOW_DAYS = 30;

/** The label catalogue's tones as colours — the same five the web uses; muted takes the theme's. */
const LABEL_HEX: Record<Exclude<LabelTone, 'muted'>, string> = {
  red: '#ef4444',
  amber: '#f59e0b',
  orange: '#f97316',
  purple: '#a855f7',
};

export function labelColor(tone: LabelTone, muted: string): string {
  return tone === 'muted' ? muted : LABEL_HEX[tone];
}

/** A list plus where it has got to. `done` means the server has no more rows. */
export interface Feed<T> {
  rows: T[];
  page: number;
  done: boolean;
}

/** "yyyy-MM-dd" → a Date for the calendar; a calendar day has no zone. */
export function dateFromISO(d: string | null): Date | null {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

/** "2026-08-05" → "8/5" — short enough to sit inside a chip. */
export function shortDay(iso: string): string {
  const [, m = '', d = ''] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * A calendar day, `back` days ago, in the device's own zone.
 *
 * The query is a date, not an instant: the server resolves each day against the
 * entry's own timezone, so what this has to send is which days the reader means.
 */
export function dayISO(back: number): string {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return localDateKey(d);
}

export const s = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  controls: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    height: 42,
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
  flag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flagText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  note: { fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
  },
  rejectBtn: { borderWidth: 1 },
  approveBtn: { backgroundColor: COLORS.primary },
  actionBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZE.base, marginTop: SPACING.md, textAlign: 'center', paddingHorizontal: SPACING.xl },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md },
  editText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  editedNote: { fontSize: FONT_SIZE.xs, marginLeft: SPACING.sm },
  sheetHint: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.md },
  input: {
    minHeight: 90,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    fontSize: FONT_SIZE.base,
    textAlignVertical: 'top',
  },
  sheetBtn: { marginTop: SPACING.md, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  sheetBtnText: { color: '#fff', fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
});
