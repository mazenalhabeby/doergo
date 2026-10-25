/**
 * TIME OUTSIDE THE SHIFT — one decision for it (docs/plans/time-counting-model.md, phase 3).
 *
 * With a planned shift, the counted time is the plan: what was worked before the planned
 * start or after the planned end is recorded and NOT counted (counted-time.ts). Until a
 * leader decides it, it waited silently — approving the day did not count it, and only an
 * office edit or an overtime round could. Now it is ONE inbox item per entry: count all of
 * it, count part of it, or don't count it.
 *
 * ⚠️ A decision MOVES THE PLAN, like approved overtime: counting 30 minutes after the end
 * sets the planned end 30 minutes later, and the one counted-time rule counts it. Nothing
 * else learns a new rule.
 *
 * ⚠️ Only a SHIFT's plan. A no-shift session's end is a daily-limit marker, which cuts
 * nothing (no-shift-limit.ts), so there is nothing outside it to decide.
 */

/**
 * Who decides time outside the shift (clock review A10, 2026-10-25): it changes counted hours AFTER the
 * shift — the payroll sign-off — so a person must hold BOTH approve hours and approve overtime (the overtime
 * the decision writes). A team leader answers extra time live, on site, but not minutes after the fact.
 * The gateway guards and scopes on these, task-service routes "waiting for" to their holders.
 */
export const OUTSIDE_SHIFT_DECIDE_KEYS = ['canApproveAttendance', 'canApproveOvertime'] as const;

export interface OutsideShiftEntry {
  clockInAt: Date | string;
  clockOutAt: Date | string | null;
  expectedClockInAt: Date | string | null;
  expectedClockOutAt: Date | string | null;
  endIsDailyLimit?: boolean | null;
}

export interface OutsideShift {
  /** Worked before the planned start, minutes. */
  before: number;
  /** Worked after the planned end, minutes. */
  after: number;
  total: number;
}

const ms = (d: Date | string) => new Date(d).getTime();

/**
 * The minutes worked outside a closed entry's planned shift, or null when there is nothing to
 * decide: no shift, still running, a daily limit, or within the tolerance on both sides (the
 * same tolerance that decides "late" and "overtime").
 */
export function outsideShift(entry: OutsideShiftEntry, toleranceMin = 0): OutsideShift | null {
  if (!entry.clockOutAt || !entry.expectedClockInAt || !entry.expectedClockOutAt || entry.endIsDailyLimit) return null;
  const before = Math.max(0, Math.round((ms(entry.expectedClockInAt) - ms(entry.clockInAt)) / 60_000));
  const after = Math.max(0, Math.round((ms(entry.clockOutAt) - ms(entry.expectedClockOutAt)) / 60_000));
  const b = before > toleranceMin ? before : 0;
  const a = after > toleranceMin ? after : 0;
  return b + a > 0 ? { before: b, after: a, total: b + a } : null;
}

/**
 * Does refusing extra time settle this entry's time outside the shift (clock review B1)? A "no" to more
 * time IS the answer about the time after the end — asked again later as "outside the shift" it was a
 * second, contradicting question. It settles it only when nothing was worked before the start too (that
 * part was never asked about); then the entry is marked decided, counted 0.
 */
export function refusalSettlesOutside(
  entry: Pick<OutsideShiftEntry, 'clockInAt' | 'expectedClockInAt'>,
  toleranceMin = 0,
): boolean {
  if (!entry.expectedClockInAt) return true;
  const early = Math.round((ms(entry.expectedClockInAt) - ms(entry.clockInAt)) / 60_000);
  return early <= toleranceMin;
}

/**
 * The plan after counting `minutes` of it: the time after the end first (the usual "stayed
 * late"), then the time before the start. Never past the real clock-in / clock-out.
 * 0 leaves the plan as it is.
 */
export function planAfterCounting(
  entry: OutsideShiftEntry,
  outside: OutsideShift,
  minutes: number,
): { expectedClockInAt: Date; expectedClockOutAt: Date; counted: number } {
  const start = new Date(entry.expectedClockInAt!);
  const end = new Date(entry.expectedClockOutAt!);
  const wanted = Math.max(0, Math.min(Math.round(minutes), outside.total));
  const afterCounted = Math.min(wanted, outside.after);
  const beforeCounted = Math.min(wanted - afterCounted, outside.before);
  return {
    expectedClockInAt: new Date(start.getTime() - beforeCounted * 60_000),
    expectedClockOutAt: new Date(end.getTime() + afterCounted * 60_000),
    counted: afterCounted + beforeCounted,
  };
}

/** `GET /attendance/outside/mine` — the member's own undecided time outside the shift, and whom it waits for. */
export interface OutsideShiftWaiting {
  entryId: string;
  /** The local day the entry started, yyyy-mm-dd. */
  date: string;
  place: string | null;
  before: number;
  after: number;
  total: number;
  askedOf: { names: string[]; more: number };
}
