import { Injectable } from '@nestjs/common';
import { notEndedWhere, zoneOf, rotaFor, dowOfDay, workspaceSchedulesShifts } from '@hbcfield/shared';
import { SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN } from '@hbcfield/shared';
// Wall time ↔ UTC comes from ONE place. This service used to carry a verbatim
// private copy of all of it; two copies of "what time is 06:00 in Vienna" are
// two chances to be an hour wrong twice a year.
import { localPartsIn, addDaysStr } from '@hbcfield/shared';
import { ResolverSpace, ResolvedShift, shiftWindowOn } from './shift-resolver-helpers';
import { PrismaService } from '@hbcfield/shared';
import { shiftFromLegacySchedule, shiftFromRota, rotaWindowOnDate } from './shift-sources';

export { type ResolverSpace } from './shift-resolver-helpers';

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
/** One planned shift of a member on one local day, as `plannedWindows` answers it. */
export interface PlannedWindow {
  dateStr: string;
  shiftId: string | null;
  expectedClockInAt: Date;
  expectedClockOutAt: Date;
  /** How long after its end a clock-in still belongs to it (`endedBefore`, the clock-in's own rule). */
  toleranceMin: number;
}

@Injectable()
export class ShiftResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * MATERIALIZATION helper (no clock-in): does this rota assignment run on the
   * given local calendar date, and if so, the shift's absolute UTC start/end?
   * Used to precompute expected shifts for no-show detection. `tz` is the space's
   * tz (physical) or the member's/org tz (logical).
   */
  matchAndWindowForDate(
    assignment: Parameters<typeof rotaWindowOnDate>[0],
    tz: string,
    dateStr: string, // YYYY-MM-DD in tz
  ): { expectedClockInAt: Date; expectedClockOutAt: Date } | null {
    return rotaWindowOnDate(assignment, tz, dateStr);
  }

  async resolveForClockIn(params: {
    userId: string;
    space: ResolverSpace;
    clockInAt: Date;
    /** The worker's own timezone (from their clock-in GPS). Used ONLY for logical
     *  (pin-less) spaces, where shifts are anchored to the worker, not a site. */
    clockInTz?: string;
    /**
     * Re-matching an entry written BEFORE the label rules: the first matching rota
     * row wins, exactly as it did then — the past is not re-judged by the new chooser.
     */
    firstMatch?: boolean;
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
    const tz = spaceIsPhysical ? zoneOf(space.timezone) : zoneOf(params.clockInTz, space.timezone);
    const local = localPartsIn(clockInAt, tz);

    // ── 1. Rota assignment ──────────────────────────────────────────────
    const assignment = await shiftFromRota(this.prisma, userId, space.id, clockInAt, tz, local, params.firstMatch);
    if (assignment) return assignment;

    // ── 2. Legacy weekly schedule (FIXED) ───────────────────────────────
    return shiftFromLegacySchedule(this.prisma, userId, clockInAt, tz, local);
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
  ): Promise<Map<string, PlannedWindow[]>> {
    const out = new Map<string, PlannedWindow[]>();
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
          ...notEndedWhere(from),
        },
        include: { shift: true },
        // The same order shiftFromRota reads them in: the first match wins.
        orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
      }),
      this.prisma.technicianSchedule.findMany({ where: { technicianId: userId, isActive: true } }),
    ]);
    for (const space of scheduling) {
      const tz = zoneOf(space.timezone);
      const windows: PlannedWindow[] = [];
      for (const dateStr of daysBySpace.get(space.id) ?? []) {
        // The shared rota rule (`rotaFor`: priority, then most recently effective, in force, runs that day).
        const a = rotaFor(
          assignments.filter((x) => x.spaceId === space.id),
          dateStr,
        );
        let found: (typeof windows)[number] | null = a?.shift
          ? {
              dateStr,
              shiftId: a.shift.id,
              toleranceMin: a.shift.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
              ...shiftWindowOn(a.shift, tz, dateStr),
            }
          : null;
        if (!found) {
          const dow = dowOfDay(dateStr);
          const legacy = schedules.find((s) => s.dayOfWeek === dow && s.endTime);
          if (legacy) {
            found = {
              dateStr,
              shiftId: null,
              toleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, // legacy schedules use the default
              ...shiftWindowOn(
                { startLocal: legacy.startTime, endLocal: legacy.endTime!, crossesMidnight: false },
                tz,
                dateStr,
              ),
            };
          }
        }
        if (found) windows.push(found);
      }
      out.set(space.id, windows);
    }
    return out;
  }
}
