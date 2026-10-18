/**
 * How many clock pushes one person gets in a day.
 *
 * Decided 2026-10-18 (docs/plans/clock-attendance-2026-10.md): an ordinary day
 * used to bring 8–15 clock prompts — reminders repeated every five minutes
 * whether or not the first was seen. Now: at most FOUR nudges about the clock
 * per person per day, and a reminder of one kind is repeated at most ONCE (the
 * app reports no "opened" signal the server could wait for, so "repeat only if
 * not opened" is "repeat at most once").
 *
 * Only NUDGES are budgeted — pushes that ask the worker to do something about
 * their own clock. An answer to the worker (a decision, an approval) is never
 * held back, and the leader's escalations are not the worker's budget: they go
 * out on schedule.
 */

/** At most this many clock nudges per person per day. */
export const CLOCK_PUSH_DAILY_BUDGET = 4;

/** A nudge of one kind is sent at most this many times a day (the first + one repeat). */
export const CLOCK_PUSH_PER_KIND_DAILY = 2;

/** The worker-facing clock nudges the budget counts. */
export const BUDGETED_CLOCK_PUSH_TYPES = [
  'noshow_reminder',
  'break_due',
  'break_over',
  'shift_reminder',
  'attendance.geofence_excursion_out',
  'attendance.rest_started',
] as const;

export type BudgetedClockPushType = (typeof BUDGETED_CLOCK_PUSH_TYPES)[number];

export function isBudgetedClockPush(type: unknown): type is BudgetedClockPushType {
  return typeof type === 'string' && (BUDGETED_CLOCK_PUSH_TYPES as readonly string[]).includes(type);
}

/** The day a budget belongs to — UTC, so every replica counts the same day. */
export function clockPushBudgetDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Given what one person has already been sent today, may this nudge go?
 * Pure; the sending side keeps the counts.
 */
export function clockPushAllowed(sentToday: { total: number; ofThisKind: number }): boolean {
  return sentToday.total < CLOCK_PUSH_DAILY_BUDGET && sentToday.ofThisKind < CLOCK_PUSH_PER_KIND_DAILY;
}
