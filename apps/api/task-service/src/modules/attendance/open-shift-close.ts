import { OPEN_SHIFT_CLOSE } from '@hbcfield/shared';

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
export type ClockOutBasis = 'LEFT_SITE' | 'SHIFT_END' | 'CLOCK_IN_PLUS_8H';

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
