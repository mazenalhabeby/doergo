/**
 * Time labels for entries judged by the label rules (LABEL_RULES_VERSION).
 *
 * Pure: the server reads the rows, these decide. Plan:
 * docs/plans/clock-attendance-2026-10.md.
 */
import { computeScheduleFlags } from '../../utils/attendance-flags';

const MIN = 60_000;

/** One instance of a shift a clock-in could belong to, in the caller's priority order. */
export interface ShiftInstanceCandidate {
  expectedClockInAt: Date;
  expectedClockOutAt: Date;
  toleranceMin: number;
}

/**
 * How far ahead an upcoming instance is preferred over one that just finished.
 * Arriving at 12:05 for a 13:00 afternoon shift is for the afternoon; arriving
 * at 12:05 when the next shift is at 18:00 is the tail of the morning.
 */
export const UPCOMING_SHIFT_PREFERENCE_MIN = 4 * 60;

/**
 * Which instance a clock-in belongs to.
 *
 * 1. The one it falls in (start ≤ clock-in < end), in priority order.
 * 2. Else the next to start, if it starts within UPCOMING_SHIFT_PREFERENCE_MIN.
 * 3. Else one that ended within its own grace (arriving just after the end).
 * 4. Else the next to start, however far.
 *
 * ⚠️ The old rule took the first instance not yet ended past its grace, in
 * priority order: back at 12:05 for a 13:00 afternoon shift was bound to the
 * 08:00 morning one (“Late 4 h 05 min”), and 06:05 for a 07:00 day shift to
 * last night's 22:00 one.
 */
export function chooseShiftInstance<T extends ShiftInstanceCandidate>(candidates: readonly T[], clockInAt: Date): T | null {
  const t = clockInAt.getTime();
  const containing = candidates.find((c) => c.expectedClockInAt.getTime() <= t && t < c.expectedClockOutAt.getTime());
  if (containing) return containing;

  const upcoming = candidates
    .filter((c) => c.expectedClockInAt.getTime() > t)
    .sort((a, b) => a.expectedClockInAt.getTime() - b.expectedClockInAt.getTime())[0];
  if (upcoming && upcoming.expectedClockInAt.getTime() - t <= UPCOMING_SHIFT_PREFERENCE_MIN * MIN) return upcoming;

  const justEnded = candidates.find(
    (c) => c.expectedClockOutAt.getTime() <= t && t - c.expectedClockOutAt.getTime() <= c.toleranceMin * MIN,
  );
  return justEnded ?? upcoming ?? null;
}

/**
 * LATE_ARRIVAL, judged only for the FIRST entry of a shift instance. Coming
 * back after lunch, or after a short trip, is never “late” against the morning
 * start — it is judged as a rest instead (lateFromRest).
 */
export function arrivalFlags(input: {
  firstOfShift: boolean;
  clockInAt: Date;
  expectedClockInAt: Date | null | undefined;
  toleranceMin: number;
}): string[] {
  if (!input.firstOfShift) return [];
  return computeScheduleFlags({
    clockInAt: input.clockInAt,
    expectedClockInAt: input.expectedClockInAt,
    toleranceMin: input.toleranceMin,
  });
}

/** A planned rest and the time actually taken, in whole minutes. */
export interface RestTaken {
  plannedMin: number;
  takenMin: number;
  overMin: number;
}

/**
 * Was the rest longer than planned + the shift's grace?
 *
 * Only a PLANNED rest is judged: without a plan there is no “planned length” to
 * be late against, and an unplanned absence is not called a rest. Returns null
 * when nothing is judged.
 */
export function lateFromRest(input: {
  plannedMin: number | null | undefined;
  startedAt: Date;
  endedAt: Date;
  toleranceMin: number;
}): RestTaken | null {
  const planned = input.plannedMin ?? 0;
  if (planned <= 0) return null;
  const taken = Math.max(0, Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / MIN));
  const over = Math.max(0, taken - planned - Math.max(0, input.toleranceMin));
  return { plannedMin: planned, takenMin: taken, overMin: over };
}

/** The label for a judged rest. */
export function restFlags(rest: RestTaken | null): string[] {
  return rest && rest.overMin > 0 ? ['LATE_FROM_REST'] : [];
}

/**
 * The planned length of the rest a person went on, from an entry's frozen rest
 * plan: the earliest item not yet taken (the one they left for). 0 = none planned.
 */
export function plannedRestMinutes(
  plan: ReadonlyArray<{ state?: string; dueAt?: string; durationMinutes?: number }> | null | undefined,
): number {
  if (!Array.isArray(plan)) return 0;
  const open = plan
    .filter((i) => i.state !== 'TAKEN' && (i.durationMinutes ?? 0) > 0)
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  return open[0]?.durationMinutes ?? 0;
}
