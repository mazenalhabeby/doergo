import { toISODateString } from '../utils/date';
/**
 * The rota — who works which shift on which day — as ONE set of rules.
 *
 * ⚠️ THE CLOCK-IN AND THE SCHEDULES PAGE ASK THE SAME QUESTION. The clock-in
 * resolves a member's shift from the rota (then falls back to the personal
 * weekly schedule); the Schedules page draws a week of the same answer. Two
 * copies of "does this assignment run on Wednesday" is how the page shows a
 * shift the clock-in does not hold anybody to.
 *
 * Pure: dates are local calendar days, `YYYY-MM-DD`, in the space's timezone.
 */

export type RotaRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONE_OFF' | string;

export interface RotaAssignmentLike {
  id: string;
  recurrence: RotaRecurrence;
  daysOfWeek: number[];
  daysOfMonth: number[];
  /** ONE_OFF dates, stored as midnight-UTC of the calendar day picked. */
  dates: Array<Date | string>;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
  priority: number;
  isActive: boolean;
  shiftId: string;
  shift?: { isActive?: boolean } | null;
}

const dayOf = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : toISODateString(d));

/** 0 = Sunday … 6 = Saturday, of a calendar day. */
export function dowOfDay(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** Does this assignment's recurrence land on this calendar day? */
export function rotaRunsOn(a: Pick<RotaAssignmentLike, 'recurrence' | 'daysOfWeek' | 'daysOfMonth' | 'dates'>, dateStr: string): boolean {
  switch (a.recurrence) {
    case 'DAILY':
      return true;
    case 'WEEKLY':
      return a.daysOfWeek.includes(dowOfDay(dateStr));
    case 'MONTHLY':
      return a.daysOfMonth.includes(Number(dateStr.slice(8, 10)));
    case 'ONE_OFF':
      // A picked calendar date, compared as a date — never re-zoned, or a
      // "March 15" one-off moves a day west of UTC.
      return a.dates.some((d) => dayOf(d) === dateStr);
    default:
      return false;
  }
}

/** Is the assignment in force on this day (its effective window covers it)? */
export function rotaInForceOn(a: Pick<RotaAssignmentLike, 'effectiveFrom' | 'effectiveTo' | 'isActive'>, dateStr: string): boolean {
  if (!a.isActive) return false;
  if (dayOf(a.effectiveFrom) > dateStr) return false;
  return !a.effectiveTo || dayOf(a.effectiveTo) >= dateStr;
}

/**
 * The assignment that decides this day, or null: the highest priority wins,
 * then the most recently effective — the clock-in's own order.
 */
export function rotaFor<T extends RotaAssignmentLike>(assignments: readonly T[], dateStr: string): T | null {
  const ranked = [...assignments].sort(
    (a, b) => b.priority - a.priority || dayOf(b.effectiveFrom).localeCompare(dayOf(a.effectiveFrom)),
  );
  for (const a of ranked) {
    if (a.shift && a.shift.isActive === false) continue;
    if (rotaInForceOn(a, dateStr) && rotaRunsOn(a, dateStr)) return a;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Changing one day                                                    */
/* ------------------------------------------------------------------ */

export type RotaDayChange = {
  /** The day tapped. */
  date: string;
  /** The shift for that day, or null for "off". */
  shiftId: string | null;
  /** That day only, or that weekday from this day on. */
  repeat: 'once' | 'weekly';
};

export type RotaOp =
  | { kind: 'create'; data: { recurrence: 'ONE_OFF' | 'WEEKLY'; shiftId: string; daysOfWeek: number[]; dates: string[]; effectiveFrom: string; priority: number } }
  | { kind: 'update'; id: string; data: { daysOfWeek?: number[]; dates?: string[]; effectiveTo?: string; isActive?: boolean } }
  | { kind: 'clone'; fromId: string; data: { daysOfWeek: number[]; effectiveFrom: string } };

export class RotaDayRefused extends Error {
  constructor(public readonly code: 'OFF_ONCE_NEEDS_LEAVE') {
    super(code);
  }
}

const addDaysStr = (dateStr: string, n: number) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toISODateString(new Date(Date.UTC(y!, m! - 1, d! + n)));
};

/**
 * What changing one person's day does to their rota in this space — as a
 * list of operations, computed before anything is written.
 *
 * ⚠️ HISTORY IS NOT REWRITTEN. A weekly assignment that already ran is not
 * edited in place: it is ENDED the day before and continued from the day
 * tapped with the new weekdays. Last month's rota still reads as it was.
 *
 * ⚠️ "OFF, THIS DAY ONLY" OVER A WEEKLY SHIFT IS REFUSED. The rota has no
 * negative entry — a single day off from a standing shift is time off, and
 * it belongs in the leave request, where it is approved and counted.
 *
 * `existing` is this member's assignments in this space.
 */
export function planRotaDay(existing: readonly RotaAssignmentLike[], change: RotaDayChange): RotaOp[] {
  const ops: RotaOp[] = [];
  const { date, shiftId, repeat } = change;
  const dow = dowOfDay(date);
  const topPriority = existing.reduce((m, a) => Math.max(m, a.priority), 0);

  // A one-off already on this day is replaced whatever happens next.
  for (const a of existing) {
    if (a.recurrence !== 'ONE_OFF' || !a.isActive) continue;
    const dates = a.dates.map(dayOf);
    if (!dates.includes(date)) continue;
    const left = dates.filter((d) => d !== date);
    ops.push(left.length ? { kind: 'update', id: a.id, data: { dates: left } } : { kind: 'update', id: a.id, data: { isActive: false } });
  }

  if (repeat === 'once') {
    if (shiftId) {
      // Above every standing rule, so it wins this one day.
      ops.push({ kind: 'create', data: { recurrence: 'ONE_OFF', shiftId, daysOfWeek: [], dates: [date], effectiveFrom: date, priority: topPriority + 1 } });
      return ops;
    }
    const standing = existing.filter((a) => a.recurrence !== 'ONE_OFF');
    if (rotaFor(standing, date)) throw new RotaDayRefused('OFF_ONCE_NEEDS_LEAVE');
    return ops;
  }

  // Weekly: take this weekday out of every standing weekly rule in force from this day…
  const weekly = existing.filter((a) => a.recurrence === 'WEEKLY' && a.isActive && (!a.effectiveTo || dayOf(a.effectiveTo) >= date));
  const target = shiftId ? weekly.find((a) => a.shiftId === shiftId) : undefined;
  for (const a of weekly) {
    const has = a.daysOfWeek.includes(dow);
    const wants = a === target;
    if (has === wants) continue;
    const days = wants ? [...a.daysOfWeek, dow].sort() : a.daysOfWeek.filter((d) => d !== dow);
    if (dayOf(a.effectiveFrom) >= date) {
      // Not started yet — nothing it did is history; change it in place.
      ops.push({ kind: 'update', id: a.id, data: days.length ? { daysOfWeek: days } : { isActive: false } });
    } else {
      ops.push({ kind: 'update', id: a.id, data: { effectiveTo: addDaysStr(date, -1) } });
      if (days.length) ops.push({ kind: 'clone', fromId: a.id, data: { daysOfWeek: days, effectiveFrom: date } });
    }
  }
  // …and give it to the shift chosen, as a new weekly rule when there was none.
  if (shiftId && !target) {
    ops.push({ kind: 'create', data: { recurrence: 'WEEKLY', shiftId, daysOfWeek: [dow], dates: [], effectiveFrom: date, priority: 0 } });
  }
  return ops;
}
