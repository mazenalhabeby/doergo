import { WorkModel } from '@hbcfield/shared';
import { zonedWallTimeToUtc, addDaysStr, parseHm, type LocalParts } from '@hbcfield/shared';

/**
 * Space (CompanyLocation) fields the resolver needs.
 */
export interface ResolverSpace {
  id: string;
  timezone: string;
  workModel: WorkModel | string;
  // Coordinates decide physical vs logical. A PHYSICAL space (has a pin) anchors
  // its shifts to the SITE's timezone (one clock for everyone on site). A LOGICAL
  // space (no pin) has no inherent timezone, so its shifts are anchored to each
  // worker's own clock-in timezone (18:00–06:00 = their local evening→morning).
  lat?: number | null;
  lng?: number | null;
}

/**
 * The shift expectation stamped onto a TimeEntry at clock-in. All timestamps are
 * absolute UTC instants — computed ONCE here so the reminder engine never has to
 * redo timezone math. `expectedClockOutAt` is midnight/DST-safe (a 22:00→06:00
 * night shift resolves to *tomorrow* 06:00 as a real instant).
 */
interface ResolvedShift {
  shiftId: string | null; // null when resolved from a legacy weekly schedule
  shiftName?: string | null; // for the label facts ("Night shift")
  expectedClockInAt: Date; // when the shift is expected to START (for late/no-show)
  expectedClockOutAt: Date; // when the shift is expected to end
  nextRemindAt: Date; // expectedClockOutAt + grace → first reminder is due here
  graceMin: number;
  reminderIntervalMin: number;
  maxReminders: number;
  flagToleranceMin: number; // grace before LATE/EARLY/OVERTIME flags (per-shift)
  source: 'assignment' | 'schedule';
}

// ──────────────────────────────────────────────────────────────────────────
// Which instance of a shift a moment belongs to (dependency-free, DST-safe)
// ──────────────────────────────────────────────────────────────────────────

type ShiftHours = { startLocal: string; endLocal: string; crossesMidnight: boolean };

/**
 * The local day the shift instance a clock-in belongs to STARTED on.
 *
 * For a cross-midnight shift (e.g. 18:00→06:00) only the early-morning TAIL —
 * local time before the shift END — belongs to YESTERDAY's instance. Any other
 * time is today's: in particular, clocking in a little BEFORE the evening start
 * (17:35 before 18:00) is simply EARLY for today's shift and must NOT roll back a
 * day — doing so mislabels an early arrival as roughly a full day late.
 */
function instanceStartDay(shift: ShiftHours, local: LocalDate): string {
  if (!shift.crossesMidnight) return local.dateStr;
  const [endH, endM] = parseHm(shift.endLocal);
  return local.minutesOfDay < endH * 60 + endM ? addDaysStr(local.dateStr, -1) : local.dateStr;
}

/**
 * The absolute start and end of the instance that starts on `startDay`. A
 * cross-midnight shift ends on the NEXT local day — as a real instant, so DST
 * and midnight need no special handling downstream.
 */
function shiftWindowOn(shift: ShiftHours, tz: string, startDay: string): { expectedClockInAt: Date; expectedClockOutAt: Date } {
  const [sH, sM] = parseHm(shift.startLocal);
  const [eH, eM] = parseHm(shift.endLocal);
  return {
    expectedClockInAt: zonedWallTimeToUtc(startDay, sH, sM, tz),
    expectedClockOutAt: zonedWallTimeToUtc(shift.crossesMidnight ? addDaysStr(startDay, 1) : startDay, eH, eM, tz),
  };
}

/** Had this instance already ended — beyond the shift's own tolerance — when they clocked in? */
function endedBefore(end: Date, clockInAt: Date, toleranceMin: number): boolean {
  return clockInAt.getTime() > end.getTime() + Math.max(0, toleranceMin) * 60_000;
}

/**
 * The local calendar parts of an instant — the shared shape
 * (attendance/zoned-time), named here for the call sites that read it.
 */
type LocalDate = LocalParts;

export { ResolvedShift, ShiftHours, instanceStartDay, shiftWindowOn, endedBefore, LocalDate };
