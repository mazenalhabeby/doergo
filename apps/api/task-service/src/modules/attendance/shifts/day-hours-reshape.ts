import { computeScheduleFlags, flagsAgainstDailyLimit, SHIFT_REMINDER_DEFAULTS } from '@hbcfield/shared';

/*
  The office set the hours of ONE day (docs/plans/time-counting-model.md, phase 2): what that
  does to an entry ALREADY recorded that day. Pure — the service reads and writes.

  The new window is the day's plan from now on: the clock counts it with no approval afterwards
  (counted time follows `expectedClockInAt` / `expectedClockOutAt` through the one existing rule).
  Only the side that moved is judged again — a new start re-judges the arrival, a new end the
  departure — so a flag about something else (geofence, offline, a missed rest) survives.
*/

const ARRIVAL_FLAGS = new Set(['LATE_ARRIVAL']);
const DEPARTURE_FLAGS = new Set(['EARLY_DEPARTURE', 'OVERTIME', 'PAST_DAILY_LIMIT']);
/** Reminder states that only say "the planned end passed" — re-armed from the new end. Extra time asked/approved is left alone. */
const PLAIN_REMINDER_STATES = new Set(['NONE', 'REMINDED', 'ESCALATED']);

export interface DayHoursEntry {
  clockInAt: Date;
  clockOutAt: Date | null;
  expectedClockInAt: Date | null;
  expectedClockOutAt: Date | null;
  endIsDailyLimit: boolean | null;
  flagReasons: string[];
  reminderState?: string | null;
}

export interface DayHoursReshape {
  expectedClockInAt: Date | null;
  expectedClockOutAt: Date | null;
  endIsDailyLimit: boolean;
  flagReasons: string[];
  /** Only for a running entry whose end moved: the clock-out reminder from the new end. */
  reminder: { nextRemindAt: Date; reminderState: 'NONE'; reminderCount: 0 } | null;
  startMoved: boolean;
  endMoved: boolean;
}

export function reshapeForDayHours(
  entry: DayHoursEntry,
  window: { start: Date | null; end: Date | null },
  toleranceMin: number,
  now: Date,
): DayHoursReshape {
  const startMoved = window.start != null && window.start.getTime() !== entry.expectedClockInAt?.getTime();
  const endMoved = window.end != null && window.end.getTime() !== entry.expectedClockOutAt?.getTime();
  const expectedClockInAt = startMoved ? window.start : entry.expectedClockInAt;
  const expectedClockOutAt = endMoved ? window.end : entry.expectedClockOutAt;
  // An end the office set is a real end, not a no-shift daily limit any more.
  const endIsDailyLimit = endMoved ? false : !!entry.endIsDailyLimit;

  let flags = entry.flagReasons;
  if (startMoved) {
    flags = [
      ...flags.filter((f) => !ARRIVAL_FLAGS.has(f)),
      ...computeScheduleFlags({ clockInAt: entry.clockInAt, expectedClockInAt, toleranceMin }),
    ];
  }
  if (endMoved && entry.clockOutAt) {
    flags = [
      ...flags.filter((f) => !DEPARTURE_FLAGS.has(f)),
      ...flagsAgainstDailyLimit(
        computeScheduleFlags({ clockOutAt: entry.clockOutAt, expectedClockOutAt, toleranceMin }),
        endIsDailyLimit,
      ),
    ];
  }

  const rearm =
    endMoved && !entry.clockOutAt && expectedClockOutAt && PLAIN_REMINDER_STATES.has(entry.reminderState ?? 'NONE');
  return {
    expectedClockInAt,
    expectedClockOutAt,
    endIsDailyLimit,
    flagReasons: [...new Set(flags)],
    reminder: rearm
      ? {
          nextRemindAt: new Date(
            Math.max(expectedClockOutAt.getTime(), now.getTime()) + SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES * 60_000,
          ),
          reminderState: 'NONE',
          reminderCount: 0,
        }
      : null,
    startMoved,
    endMoved,
  };
}

/**
 * Time outside the old plan that was already AGREED survives new hours (docs/plans/time-counting-model.md):
 * approved overtime rounds — after the end, decided once by moving the plan — go on after a REPLACED end,
 * and time counted before the start (`outsideBeforeMinutes`) before a replaced start. A side the new hours
 * leave alone already carries it. Without this, 08–16 + 120 min agreed (end 18:00), set to 08:00–16:30,
 * counted only to 16:30 and the approved overtime was gone.
 */
export function withAgreedOutside(
  window: { start: Date | null; end: Date | null },
  agreed: { roundMinutes: number; beforeMinutes: number },
  replaced: { start: boolean; end: boolean },
): { start: Date | null; end: Date | null } {
  const shift = (d: Date | null, minutes: number) => (d && minutes ? new Date(d.getTime() + minutes * 60_000) : d);
  return {
    start: replaced.start ? shift(window.start, -agreed.beforeMinutes) : window.start,
    end: replaced.end ? shift(window.end, agreed.roundMinutes) : window.end,
  };
}
