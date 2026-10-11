import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkModel, SHIFT_REMINDER_DEFAULTS, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, rotaRunsOn, rotaFor, dowOfDay, workspaceSchedulesShifts } from '@hbcfield/shared';
// Wall time ↔ UTC comes from ONE place. This service used to carry a verbatim
// private copy of all of it; two copies of "what time is 06:00 in Vienna" are
// two chances to be an hour wrong twice a year.
import { zonedWallTimeToUtc, localPartsIn, addDaysStr, parseHm, type LocalParts } from '@hbcfield/shared';

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
  expectedClockInAt: Date; // when the shift is expected to START (for late/no-show)
  expectedClockOutAt: Date; // when the shift is expected to end
  nextRemindAt: Date; // expectedClockOutAt + grace → first reminder is due here
  graceMin: number;
  reminderIntervalMin: number;
  maxReminders: number;
  flagToleranceMin: number; // grace before LATE/EARLY/OVERTIME flags (per-shift)
  source: 'assignment' | 'schedule';
}

/**
 * Resolves which shift a clock-in belongs to and the exact instant it is
 * expected to end. This is the heart of the space-centric attendance model:
 * the system stops *guessing* (midnight / 16h) and instead knows the concrete
 * shift window for each clock-in.
 *
 * Resolution order (only for spaces with a work model that expects hours):
 *   1. Active ShiftAssignment (rota) matching the clock-in's local day
 *   2. Legacy TechnicianSchedule (FIXED weekly schedule) for that weekday
 *   3. null (no expectation → no reminders; e.g. TASK/NONE spaces)
 */
@Injectable()
export class ShiftResolverService {
  private readonly logger = new Logger(ShiftResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveForClockIn(params: {
    userId: string;
    space: ResolverSpace;
    clockInAt: Date;
    /** The worker's own timezone (from their clock-in GPS). Used ONLY for logical
     *  (pin-less) spaces, where shifts are anchored to the worker, not a site. */
    clockInTz?: string;
  }): Promise<ResolvedShift | null> {
    const { userId, space, clockInAt } = params;
    // Attendance is per-member: when the space tracks attendance (anything but
    // NONE), resolve each member individually — a member WITH a shift/rota (or
    // legacy schedule) gets an expected end + reminders; a member WITHOUT one
    // resolves to null and is task-based (free clock-out, no reminders). So
    // scheduled and task-based workers coexist in the same space. NONE opts the
    // whole space out (free clock in/out, no expectations).
    // ONE rule (shared) for "does this workspace schedule shifts" — the clock-in's
    // UNSCHEDULED_DAY flag and the SHIFT_ONLY policy read the same answer.
    if (!workspaceSchedulesShifts(space.workModel)) {
      return null;
    }

    // Physical space (has coordinates) → the SITE's timezone anchors the shift for
    // everyone. Logical space (no pin) → anchor to the WORKER's clock-in timezone
    // so "18:00–06:00" means their local evening→morning wherever they are. Falls
    // back to the space tz then UTC when the worker tz is unavailable.
    const spaceIsPhysical = space.lat != null && space.lng != null;
    const tz = spaceIsPhysical
      ? space.timezone || 'UTC'
      : params.clockInTz || space.timezone || 'UTC';
    const local = localPartsIn(clockInAt, tz);

    // ── 1. Rota assignment ──────────────────────────────────────────────
    const assignment = await this.resolveAssignment(userId, space.id, clockInAt, tz, local);
    if (assignment) return assignment;

    // ── 2. Legacy weekly schedule (FIXED) ───────────────────────────────
    return this.resolveLegacySchedule(userId, clockInAt, tz, local);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Resolution steps
  // ────────────────────────────────────────────────────────────────────────

  private async resolveAssignment(
    userId: string,
    spaceId: string,
    clockInAt: Date,
    tz: string,
    local: LocalDate,
  ): Promise<ResolvedShift | null> {
    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        userId,
        spaceId,
        isActive: true,
        effectiveFrom: { lte: clockInAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: clockInAt } }],
      },
      include: { shift: true },
      // Highest priority wins overlaps; then the most recently-effective rota.
      orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
    });

    for (const a of assignments) {
      if (!a.shift?.isActive) continue;
      const shift = a.shift;
      const toleranceMin = shift.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN;
      /*
        ⚠️ The recurrence is asked of the day the instance STARTED. The 01:00
        tail of a 22:00–06:00 night belongs to yesterday's instance, so a Friday
        night on a Mon–Fri rota keeps its Saturday-morning tail, and a Monday
        01:00 clock-in is not bound to a "Sunday 22:00" start nobody rostered.
      */
      const startDay = instanceStartDay(shift, local);
      if (!this.recurrenceMatches(a, { ...local, dateStr: startDay })) continue;
      const window = shiftWindowOn(shift, tz, startDay);
      /*
        ⚠️ A clock-in after that instance has ENDED (past its tolerance) is not
        for it. Binding it anyway counted ≈ 0, flagged it late and fired the
        "you should have left" reminder the moment the member arrived.
      */
      if (endedBefore(window.expectedClockOutAt, clockInAt, toleranceMin)) continue;

      const graceMin = shift.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

      return {
        shiftId: shift.id,
        expectedClockInAt: window.expectedClockInAt,
        expectedClockOutAt: window.expectedClockOutAt,
        nextRemindAt: new Date(window.expectedClockOutAt.getTime() + graceMin * 60_000),
        graceMin,
        reminderIntervalMin: shift.reminderIntervalMin ?? SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
        maxReminders: shift.maxReminders ?? SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
        flagToleranceMin: toleranceMin,
        source: 'assignment',
      };
    }
    return null;
  }

  private async resolveLegacySchedule(
    userId: string,
    clockInAt: Date,
    tz: string,
    local: LocalDate,
  ): Promise<ResolvedShift | null> {
    const schedule = await this.prisma.technicianSchedule.findFirst({
      where: { technicianId: userId, dayOfWeek: local.dow, isActive: true },
    });
    if (!schedule?.endTime) return null;

    // Legacy schedules never cross midnight → start & end are on the clock-in's local day.
    const { expectedClockInAt, expectedClockOutAt } = shiftWindowOn(
      { startLocal: schedule.startTime, endLocal: schedule.endTime, crossesMidnight: false },
      tz,
      local.dateStr,
    );
    // The same rule as a rota shift: today's hours already over are not this clock-in's.
    if (endedBefore(expectedClockOutAt, clockInAt, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN)) return null;
    const graceMin = SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

    return {
      shiftId: null,
      expectedClockInAt,
      expectedClockOutAt,
      nextRemindAt: new Date(expectedClockOutAt.getTime() + graceMin * 60_000),
      graceMin,
      reminderIntervalMin: SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
      maxReminders: SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
      flagToleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, // legacy schedules use the default
      source: 'schedule',
    };
  }

  /**
   * ⚠️ ONE RULE — `rotaRunsOn` in shared. The Schedules page draws a week of
   * the same answer; a second copy here is how the page shows a shift the
   * clock-in does not hold anybody to.
   */
  private recurrenceMatches(
    a: { recurrence: string; daysOfWeek: number[]; daysOfMonth: number[]; dates: Date[] },
    local: LocalDate,
  ): boolean {
    return rotaRunsOn(a, local.dateStr);
  }

  /**
   * The planned shift windows of ONE member, at several PHYSICAL workspaces, on
   * the given local days — the same answer `resolveForClockIn` would give a
   * clock-in on each day (rota first, by priority then the most recently
   * effective; then the legacy weekly schedule), asked ahead of time.
   *
   * For the automatic clock's plan (the phone arms offline). TWO queries
   * whatever the number of workspaces and days — never one resolution each.
   * Each space is anchored to its own timezone (callers pass physical spaces
   * only: an automatic clock needs a site).
   */
  async plannedWindows(
    userId: string,
    spaces: readonly ResolverSpace[],
    days: (space: ResolverSpace) => string[],
  ): Promise<Map<string, Array<{ dateStr: string; shiftId: string | null; expectedClockInAt: Date; expectedClockOutAt: Date }>>> {
    const out = new Map<string, Array<{ dateStr: string; shiftId: string | null; expectedClockInAt: Date; expectedClockOutAt: Date }>>();
    const scheduling = spaces.filter((s) => workspaceSchedulesShifts(s.workModel));
    if (!scheduling.length) return out;
    const daysBySpace = new Map(scheduling.map((s) => [s.id, days(s)]));
    const allDays = [...daysBySpace.values()].flat().sort();
    if (!allDays.length) return out;
    // A day either side, in UTC, covers every zone's local day.
    const from = new Date(`${addDaysStr(allDays[0]!, -1)}T00:00:00.000Z`);
    const to = new Date(`${addDaysStr(allDays[allDays.length - 1]!, 2)}T00:00:00.000Z`);
    const [assignments, schedules] = await Promise.all([
      this.prisma.shiftAssignment.findMany({
        where: {
          userId,
          spaceId: { in: scheduling.map((s) => s.id) },
          isActive: true,
          effectiveFrom: { lte: to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
        include: { shift: true },
        // The same order resolveAssignment reads them in: the first match wins.
        orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
      }),
      this.prisma.technicianSchedule.findMany({ where: { technicianId: userId, isActive: true } }),
    ]);
    for (const space of scheduling) {
      const tz = space.timezone || 'UTC';
      const windows: Array<{ dateStr: string; shiftId: string | null; expectedClockInAt: Date; expectedClockOutAt: Date }> = [];
      for (const dateStr of daysBySpace.get(space.id) ?? []) {
        // The shared rota rule (`rotaFor`: priority, then most recently effective, in force, runs that day).
        const a = rotaFor(assignments.filter((x) => x.spaceId === space.id), dateStr);
        let found: (typeof windows)[number] | null = a?.shift
          ? { dateStr, shiftId: a.shift.id, ...shiftWindowOn(a.shift, tz, dateStr) }
          : null;
        if (!found) {
          const dow = dowOfDay(dateStr);
          const legacy = schedules.find((s) => s.dayOfWeek === dow && s.endTime);
          if (legacy) {
            found = {
              dateStr,
              shiftId: null,
              ...shiftWindowOn({ startLocal: legacy.startTime, endLocal: legacy.endTime!, crossesMidnight: false }, tz, dateStr),
            };
          }
        }
        if (found) windows.push(found);
      }
      out.set(space.id, windows);
    }
    return out;
  }

  /**
   * MATERIALIZATION helper (no clock-in): does this rota assignment run on the
   * given local calendar date, and if so, the shift's absolute UTC start/end?
   * Used to precompute expected shifts for no-show detection. `tz` is the space's
   * tz (physical) or the member's/org tz (logical).
   */
  matchAndWindowForDate(
    assignment: {
      recurrence: string;
      daysOfWeek: number[];
      daysOfMonth: number[];
      dates: Date[];
      shift: { startLocal: string; endLocal: string; crossesMidnight: boolean };
    },
    tz: string,
    dateStr: string, // YYYY-MM-DD in tz
  ): { expectedClockInAt: Date; expectedClockOutAt: Date } | null {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
    const local: LocalDate = { dateStr, dow, dom: d!, minutesOfDay: 0 };
    if (!this.recurrenceMatches(assignment, local)) return null;

    return shiftWindowOn(assignment.shift, tz, dateStr);
  }
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
