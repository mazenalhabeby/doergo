// Single source of truth for the schedule-relative attendance flags
// (LATE_ARRIVAL / EARLY_DEPARTURE / OVERTIME). Used at clock-in, at clock-out,
// and when an entry is edited — so the threshold logic lives in ONE place (DRY)
// and the per-shift tolerance is applied consistently everywhere.

/** Fallback tolerance (minutes) when a shift doesn't specify one. */
export const SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN = 10;

export interface ScheduleFlagInput {
  clockInAt?: Date | null;
  clockOutAt?: Date | null;
  /** Shift's expected start — enables LATE_ARRIVAL. */
  expectedClockInAt?: Date | null;
  /** Shift's expected end — enables EARLY_DEPARTURE / OVERTIME. */
  expectedClockOutAt?: Date | null;
  /** Per-shift grace; falls back to SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN. */
  toleranceMin?: number | null;
}

/**
 * Compute the schedule-relative flags that apply given the actual vs expected
 * times and a tolerance. Only returns a flag when BOTH sides of the comparison
 * are present, so it's safe to call at clock-in (in-only), at clock-out
 * (out-only), or on a full edit (both). Never returns geofence/unscheduled flags
 * — those are owned by their own call sites.
 */
export function computeScheduleFlags(input: ScheduleFlagInput): string[] {
  const tol =
    input.toleranceMin != null && input.toleranceMin >= 0
      ? input.toleranceMin
      : SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN;
  const flags: string[] = [];

  if (input.clockInAt && input.expectedClockInAt) {
    const lateMin = (input.clockInAt.getTime() - input.expectedClockInAt.getTime()) / 60000;
    if (lateMin > tol) flags.push('LATE_ARRIVAL');
  }

  if (input.clockOutAt && input.expectedClockOutAt) {
    const diffMin = (input.clockOutAt.getTime() - input.expectedClockOutAt.getTime()) / 60000;
    if (diffMin > tol) flags.push('OVERTIME');
    if (diffMin < -tol) flags.push('EARLY_DEPARTURE');
  }

  return flags;
}

/**
 * Every flag that depends only on the clock TIMES against the shift's
 * expectation — dropped and worked out again whenever those times change (an
 * office edit, a rematch). Geofence, unscheduled, offline and missed-rest flags
 * are about something else and survive a time change.
 *
 * ⚠️ PAST_DAILY_LIMIT belongs here: it is OVERTIME against a daily allowance
 * rather than a shift. Left out, an edit kept a stale "past the limit" on an
 * entry corrected back inside it.
 */
export const SCHEDULE_TIME_FLAGS: ReadonlySet<string> = new Set([
  'LATE_ARRIVAL',
  'EARLY_DEPARTURE',
  'OVERTIME',
  'PAST_DAILY_LIMIT',
]);

/**
 * The schedule flags read against a daily LIMIT instead of a shift: leaving
 * before an allowance is not early, and staying past it is past the limit, not
 * overtime. Identity when the planned end is a real shift end.
 */
export function flagsAgainstDailyLimit(flags: string[], endIsDailyLimit: boolean | null | undefined): string[] {
  if (!endIsDailyLimit) return flags;
  return flags.filter((f) => f !== 'EARLY_DEPARTURE').map((f) => (f === 'OVERTIME' ? 'PAST_DAILY_LIMIT' : f));
}
