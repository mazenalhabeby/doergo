import { SHIFT_REMINDER_DEFAULTS } from '@hbcfield/shared';

/**
 * A shift's own nudge cadence — gap between nudges and how many before a
 * leader is told — with the defaults where there is no shift row to read.
 *
 * ONE reading for both sweeps (an open shift that will not end, and a shift
 * nobody turned up for). The no-show sweep used to hard-code the defaults, so
 * a shift set to "nudge every 15 min, twice" was nudged every 5, three times,
 * when nobody came — and as configured only when they forgot to leave.
 * (The GRACE before the first nudge is already the shift's: it is baked into
 * `nextRemindAt` when the instance is materialized.)
 */
export function shiftNudgeCadence(
  shift?: { reminderIntervalMin?: number | null; maxReminders?: number | null } | null,
): { intervalMin: number; maxReminders: number } {
  return {
    intervalMin: shift?.reminderIntervalMin ?? SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
    maxReminders: shift?.maxReminders ?? SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
  };
}
