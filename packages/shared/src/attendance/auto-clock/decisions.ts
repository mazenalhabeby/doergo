/** The shift decisions: automatic clock-in, clock-out, and the automatic rest. */
import type { AutoClockSettings } from './settings';

/* ------------------------------------------------------------------ arrival */

export type AutoClockInDecision =
  | { action: 'CLOCK_IN'; at: Date }
  /** Inside, but not long enough yet / too early for the window — look again then. */
  | { action: 'WAIT'; until: Date }
  | { action: 'SKIP'; reason: 'NO_SHIFT' | 'SHIFT_OVER' | 'ALREADY_CLOCKED_IN' | 'NOT_INSIDE' | 'OFF' };

/**
 * Should the phone clock this member in, given when they entered the area?
 *
 * Window: from `leadMinutes` before the shift's start until its end (an
 * arrival after the end is not a shift). Dwell: they must have been inside
 * `dwellMinutes` by `now`. The recorded moment is the entry, or the window's
 * opening when they were already inside before it opened (sat in the car park
 * at 06:50 for an 08:00 shift with a 30-minute lead → 07:30).
 */
export function decideAutoClockIn(input: {
  settings: AutoClockSettings;
  now: Date;
  enteredAt: Date | null;
  stillInside: boolean;
  shiftStart: Date | null;
  shiftEnd: Date | null;
  alreadyClockedIn: boolean;
}): AutoClockInDecision {
  const { settings: s, now } = input;
  if (!s.enabled) return { action: 'SKIP', reason: 'OFF' };
  if (input.alreadyClockedIn) return { action: 'SKIP', reason: 'ALREADY_CLOCKED_IN' };
  if (!input.shiftStart || !input.shiftEnd) return { action: 'SKIP', reason: 'NO_SHIFT' };
  if (!input.stillInside || !input.enteredAt) return { action: 'SKIP', reason: 'NOT_INSIDE' };
  if (now.getTime() >= input.shiftEnd.getTime()) return { action: 'SKIP', reason: 'SHIFT_OVER' };
  const opens = new Date(input.shiftStart.getTime() - s.leadMinutes * 60_000);
  const arrival = input.enteredAt.getTime() > opens.getTime() ? input.enteredAt : opens;
  const ready = new Date(arrival.getTime() + s.dwellMinutes * 60_000);
  if (now.getTime() < ready.getTime()) return { action: 'WAIT', until: ready };
  return { action: 'CLOCK_IN', at: arrival };
}

/* ------------------------------------------------------------------ departure */

export type AutoClockOutDecision =
  | { action: 'CLOCK_OUT'; at: Date }
  | { action: 'WAIT'; until: Date }
  /** Left before the end: that is an excursion (the existing flow), not a departure. */
  | { action: 'SKIP'; reason: 'NOT_CLOCKED_IN' | 'BEFORE_END' | 'BACK_INSIDE' | 'OFF' };

/**
 * Should leaving the area clock this member out? Only a departure after the
 * planned end counts, once they have stayed outside `exitGraceMinutes` (a
 * walk to the van is not going home). The moment recorded is when they left.
 */
export function decideAutoClockOut(input: {
  settings: AutoClockSettings;
  now: Date;
  exitedAt: Date;
  stillOutside: boolean;
  plannedEnd: Date | null;
  clockedIn: boolean;
}): AutoClockOutDecision {
  const { settings: s, now } = input;
  if (!s.enabled) return { action: 'SKIP', reason: 'OFF' };
  if (!input.clockedIn) return { action: 'SKIP', reason: 'NOT_CLOCKED_IN' };
  if (!input.stillOutside) return { action: 'SKIP', reason: 'BACK_INSIDE' };
  if (!input.plannedEnd || input.exitedAt.getTime() < input.plannedEnd.getTime()) return { action: 'SKIP', reason: 'BEFORE_END' };
  const ready = new Date(input.exitedAt.getTime() + s.exitGraceMinutes * 60_000);
  if (now.getTime() < ready.getTime()) return { action: 'WAIT', until: ready };
  return { action: 'CLOCK_OUT', at: input.exitedAt };
}

/* ------------------------------------------------------------------ rest */

/** Austrian AZG §11: a rest is owed once the day is longer than six hours. */
export const AUTO_REST_AFTER_MINUTES = 360;

/**
 * The automatic rest for a shift: centred in the middle of the planned shift,
 * only when the shift is longer than six hours, no rest has been taken, and the
 * workspace switched it on. The phone starts it with a "Still working?" button
 * that cancels it — it is never deducted silently.
 */
export function autoRestPlan(input: {
  settings: AutoClockSettings;
  shiftStart: Date | null;
  shiftEnd: Date | null;
  restTaken: boolean;
}): { startAt: Date; endAt: Date } | null {
  const m = input.settings.autoRestMinutes;
  if (!input.settings.enabled || !m || input.restTaken || !input.shiftStart || !input.shiftEnd) return null;
  const length = (input.shiftEnd.getTime() - input.shiftStart.getTime()) / 60_000;
  if (length <= AUTO_REST_AFTER_MINUTES || m >= length) return null;
  const mid = input.shiftStart.getTime() + (length / 2) * 60_000;
  const startAt = new Date(Math.round((mid - (m / 2) * 60_000) / 60_000) * 60_000);
  return { startAt, endAt: new Date(startAt.getTime() + m * 60_000) };
}
