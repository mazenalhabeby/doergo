import { OPEN_SHIFT_CLOSE, breakTotals, computeScheduleFlags, endRunningBreaks, flagsAgainstDailyLimit } from '@hbcfield/shared';

/**
 * The temporary clock-out for a shift left open — pure, so every rule is a test.
 *
 * Best evidence first, and never generous:
 *  1. LEFT_SITE — the moment the member was seen leaving the site (an open
 *     out-of-ring excursion). They were not working after that.
 *  2. SHIFT_END — the planned end. Nothing past it is counted without approval.
 *  3. CLOCK_IN_PLUS_8H — no planned end and no better evidence.
 * Always between clock-in and now, and never past the planned end.
 */
type ClockOutBasis = 'LEFT_SITE' | 'SHIFT_END' | 'CLOCK_IN_PLUS_8H';

export function provisionalClockOut(input: {
  clockInAt: Date;
  expectedClockOutAt: Date | null;
  /** When an open excursion says the member left the site, if one does. */
  leftSiteAt: Date | null;
  now: Date;
}): { at: Date; basis: ClockOutBasis } {
  const { clockInAt, expectedClockOutAt, leftSiteAt, now } = input;
  const clamp = (d: Date) => {
    let t = d.getTime();
    if (expectedClockOutAt) t = Math.min(t, expectedClockOutAt.getTime());
    t = Math.min(t, now.getTime());
    return new Date(Math.max(t, clockInAt.getTime()));
  };
  if (leftSiteAt && leftSiteAt >= clockInAt) return { at: clamp(leftSiteAt), basis: 'LEFT_SITE' };
  if (expectedClockOutAt) return { at: clamp(expectedClockOutAt), basis: 'SHIFT_END' };
  return {
    at: clamp(new Date(clockInAt.getTime() + OPEN_SHIFT_CLOSE.UNPLANNED_FALLBACK_HOURS * 3_600_000)),
    basis: 'CLOCK_IN_PLUS_8H',
  };
}

/** Is this open shift due to be closed provisionally? The same rule as the sweep's query. */
export function isAbandoned(entry: { clockInAt: Date; expectedClockOutAt: Date | null }, now: Date): boolean {
  if (entry.expectedClockOutAt) {
    return now.getTime() - entry.expectedClockOutAt.getTime() >= OPEN_SHIFT_CLOSE.AFTER_SHIFT_END_HOURS * 3_600_000;
  }
  return now.getTime() - entry.clockInAt.getTime() >= OPEN_SHIFT_CLOSE.UNPLANNED_AFTER_HOURS * 3_600_000;
}

/** Flags the temporary close added, and that a real clock-out takes away again. */
export const PROVISIONAL_FLAGS: ReadonlySet<string> = new Set(['MISSED_CLOCK_OUT', 'CLOCK_OUT_PROVISIONAL']);
/** Flags that depend on the clock-out time, and are worked out again when it changes. */
export const CLOCK_OUT_TIME_FLAGS: ReadonlySet<string> = new Set(['OVERTIME', 'EARLY_DEPARTURE', 'OUTSIDE_GEOFENCE_OUT', 'PAST_DAILY_LIMIT']);

/**
 * Excursion states that are still "out" — the ones a closed shift must not
 * leave behind, or the excursion sweep goes on escalating about a shift that is
 * over (and the approver queue lists somebody who has gone home).
 */
export const OPEN_EXCURSION_STATUSES = ['OUT_UNREPORTED', 'PENDING', 'APPROVED'] as const;

/** A rest as the close reads it: every row of the shift, open or finished. */
export interface RestRow {
  id: string;
  startedAt: Date;
  endedAt?: Date | null;
  durationMinutes?: number | null;
  isPaid?: boolean | null;
}

/**
 * The rests of a shift being closed: which running ones end, when, and the
 * totals afterwards — pure, so every way a shift ends agrees on it.
 *
 * A rest still running ends at the close — never after now (a self-reported
 * time may sit a few seconds ahead of the server) and never before it began
 * (a temporary close at the shift end, with the rest taken after it, is zero
 * minutes, not negative).
 *
 * ⚠️ Totals are RECOMPUTED FROM THE ROWS, never added to the stored figure —
 * the same rule the break service follows. Incrementing would double-count a
 * rest whenever the stored total was already right, and carry forward any
 * drift whenever it was not.
 */
export function endRunningRests(
  rests: RestRow[],
  closeAt: Date,
  now: Date,
): { ends: { id: string; endedAt: Date; minutes: number }[]; breakMinutes: number; unpaidBreakMinutes: number } {
  // The shared rest rules (break-totals.ts): end what is still running, recount from the rows.
  const { rows, ended } = endRunningBreaks(rests, new Date(Math.min(closeAt.getTime(), now.getTime())));
  return {
    ends: ended.map((r) => ({ id: r.id, endedAt: r.endedAt, minutes: r.durationMinutes })),
    ...breakTotals(rows),
  };
}

/**
 * The flags that depend on WHEN a shift was closed (EARLY_DEPARTURE /
 * OVERTIME, or PAST_DAILY_LIMIT on an allowance) — one answer for every close.
 *
 * Built on `computeScheduleFlags`, the shared tolerance rule clock-in and the
 * edit dialog use. ⚠️ Only against a concrete expected end: with none the
 * session is genuinely unscheduled and cannot be early or late against
 * anything. A daily limit is an allowance, not a shift: leaving before it is
 * not early, and staying past it reads as past the limit.
 */
export function clockOutTimeFlags(
  entry: { expectedClockOutAt?: Date | null; endIsDailyLimit?: boolean | null },
  clockOutAt: Date,
  toleranceMin: number,
): string[] {
  if (!entry.expectedClockOutAt) return [];
  const flags = computeScheduleFlags({ clockOutAt, expectedClockOutAt: entry.expectedClockOutAt, toleranceMin });
  return flagsAgainstDailyLimit(flags, entry.endIsDailyLimit);
}
