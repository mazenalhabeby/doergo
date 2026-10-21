import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { ShiftResolverService, ResolverSpace } from './shift-resolver.service';
import {
  TimeEntryStatus,
  activeAssignmentWhere,
  SHIFT_REMINDER_DEFAULTS,
  noShiftReminderAt,
  noShiftAllowance,
  effectiveNoShiftPolicy,
  countedMinutesBetween,
  startOfDayIn,
  type NoShiftAllowance,
  spaceRunsClock,
} from '@hbcfield/shared';
import { dayRequestEffect, type DayRequestRow } from './approved-requests';
import { alreadyClockedIn, sameRecordOrRefuse } from './attendance-occurrence';
import { tzlookup } from './clock-in-helpers';

/**
 * What a clock-in and the clock-in list share: where the member may clock in, the
 * entry's zone, the shift stamp, the no-shift allowance, approved day requests,
 * and creating the entry once.
 *
 * A collaborator, not a base class: ClockInService, its remote and on-site
 * halves, and ClockInLocationsService each receive it.
 */
@Injectable()
export class ClockInContextService {
  // Named after the clock-in, whose log lines these always were.
  private readonly logger = new Logger('ClockInService');

  constructor(
    readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
  ) {}

  /**
   * Resolve the shift expectation for a clock-in and return the DB fields to
   * stamp on the TimeEntry. Returns {} for spaces without hour expectations
   * (workModel NONE/TASK) or when no shift/schedule matches — leaving the entry
   * with the default reminderState=NONE and no expected end. Never throws:
   * a resolver failure must not block a clock-in.
   */
  /**
   * Resolve the IANA timezone WHERE the worker physically clocked in, from the
   * clock-in GPS. Computed once here (offline, microsecond lookup) and stored on
   * the entry so display is a zero-cost read — and correct for remote clock-ins.
   * Falls back to the space's timezone when GPS is unavailable/invalid.
   */
  resolveEntryTimezone(
    lat: number | null | undefined,
    lng: number | null | undefined,
    spaceTz?: string | null,
  ): string | null {
    // (0,0) is Null Island — a missing/failed GPS fix, not a real location.
    if (lat != null && lng != null && !(lat === 0 && lng === 0)) {
      try {
        return tzlookup(lat, lng);
      } catch {
        // out-of-range / lookup miss → fall through to the space timezone
      }
    }
    return spaceTz ?? null;
  }

  /**
   * What this workspace allows a member with no shift, at this moment.
   *
   * One indexed read (userId, clockInAt) of the member's sessions touching
   * today, at EVERY workspace — a limit that only counted its own hours would
   * be walked around by clocking in next door. Rejected sessions count nothing.
   */
  async noShiftAllowanceFor(
    userId: string,
    /** `workModel` is required on purpose: without it SHIFT_ONLY cannot be judged (see `effectiveNoShiftPolicy`). */
    space: { noShiftPolicy?: string | null; noShiftDailyMinutes?: number | null; workModel: string | null | undefined },
    at: Date,
    tz: string,
    /** Overtime agreed in advance for today — raises the limit. */
    extraMinutes = 0,
  ): Promise<NoShiftAllowance & { workedTodayMinutes: number }> {
    const policy = effectiveNoShiftPolicy(space.noShiftPolicy, space.workModel);
    if (policy !== 'LIMIT') {
      return {
        ...noShiftAllowance({
          policy,
          dailyMinutes: space.noShiftDailyMinutes,
          workedTodayMinutes: 0,
          at,
          extraMinutes,
        }),
        workedTodayMinutes: 0,
      };
    }
    const dayStart = startOfDayIn(at, tz);
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId,
        // Bounded below so the index does the work; nothing stays open a day (the sweep closes it).
        clockInAt: { gte: new Date(dayStart.getTime() - 24 * 3_600_000), lt: at },
        OR: [{ clockOutAt: null }, { clockOutAt: { gt: dayStart } }],
        approvalStatus: { not: 'REJECTED' },
      },
      select: { clockInAt: true, clockOutAt: true, paidMinutes: true, totalMinutes: true, unpaidBreakMinutes: true },
    });
    const workedTodayMinutes = countedMinutesBetween(entries, dayStart, at);
    return {
      ...noShiftAllowance({ policy, dailyMinutes: space.noShiftDailyMinutes, workedTodayMinutes, at, extraMinutes }),
      workedTodayMinutes,
    };
  }

  async buildShiftStamp(
    userId: string,
    space: ResolverSpace & { noShiftDailyMinutes?: number | null },
    clockInAt: Date,
    clockInTz?: string,
  ): Promise<{
    shiftId?: string;
    /**
     * PERSISTED now, not derived. It used to be read once for the LATE_ARRIVAL
     * flag and dropped before the row was written — and nothing can clamp paid
     * time to a shift start it did not keep.
     */
    expectedClockInAt?: Date;
    expectedClockOutAt?: Date;
    nextRemindAt?: Date;
    flagToleranceMin?: number;
    /** Derived, not a column: for the label facts. */
    shiftName?: string | null;
    scheduled: boolean;
  }> {
    try {
      const resolved = await this.shiftResolver.resolveForClockIn({ userId, space, clockInAt, clockInTz });
      if (!resolved) return { ...this.unscheduledStamp(clockInAt, space), scheduled: false };
      return {
        ...(resolved.shiftId ? { shiftId: resolved.shiftId } : {}),
        expectedClockInAt: resolved.expectedClockInAt,
        expectedClockOutAt: resolved.expectedClockOutAt,
        nextRemindAt: resolved.nextRemindAt,
        flagToleranceMin: resolved.flagToleranceMin,
        shiftName: resolved.shiftName ?? null,
        scheduled: true,
      };
    } catch (err) {
      this.logger.error(`Shift resolution failed for user=${userId} space=${space.id}: ${err}`);
      // Even on resolver failure, arm the safety-net so the session can't run silently forever.
      return { ...this.unscheduledStamp(clockInAt, space), scheduled: false };
    }
  }

  /**
   * Safety-net stamp for a clock-in with NO resolved shift: leave shiftId /
   * expectedClockOutAt null (marks it "unscheduled") but arm nextRemindAt at
   * the workspace's hours without a shift, so the reminder sweep picks it up and can't let it run to 71h.
   */
  unscheduledStamp(clockInAt: Date, space: { noShiftDailyMinutes?: number | null }): { nextRemindAt: Date } {
    return { nextRemindAt: noShiftReminderAt(clockInAt, space.noShiftDailyMinutes) };
  }

  /**
   * The workspaces this member may clock in at, at `at`: assigned then, active,
   * not the Remote bucket, and running Time Tracking.
   *
   * ONE query pair for two questions that must agree — what the clock-in list
   * OFFERS, and whether the Remote bucket is open to them (only when this is
   * empty). A bucket rule looser than the list let a member assigned to a
   * strict site walk around it with `isRemote`; a stricter one would refuse
   * somebody the list shows no workspace at all.
   */
  async clockableWorkspaces(userId: string, organizationId: string, at: Date) {
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: activeAssignmentWhere(userId, at),
      // The per-workspace override rides along: it is half of the answer to
      // "may they work away from HERE", and it is on the row we already read.
      select: { spaceId: true, allowRemote: true, isPrimary: true },
    });
    const spaceIds = [...new Set(assignments.map((a) => a.spaceId))];
    if (!spaceIds.length) return { assignments, locations: [] };

    const locations = await this.prisma.companyLocation.findMany({
      where: {
        id: { in: spaceIds },
        organizationId,
        isActive: true,
        isRemote: false,
      },
      select: {
        id: true,
        name: true,
        address: true,
        lat: true,
        lng: true,
        geofenceRadius: true,
        geofencePolygon: true,
        timezone: true,
        isDefault: true,
        // The ceiling. Needed to answer `awayAllowed` below.
        geofencePolicy: true,
        // The rule for clocking in with no shift, and what the resolver needs to ask it.
        workModel: true,
        noShiftPolicy: true,
        noShiftDailyMinutes: true,
        // Whether Time Tracking runs HERE — a space's own list, else the organization's.
        enabledModules: true,
        organization: { select: { enabledModules: true } },
      },
      orderBy: { name: 'asc' },
    });
    /*
      ⚠️ ONLY WHERE TIME TRACKING RUNS. The list offered a workspace whose
      Modules tab has Time Tracking off, and the clock-in there was accepted
      (the module gate read `spaceId`, the clock-in sends `locationId`). Both
      now ask the workspace — the list must never be looser than the check.
    */
    const clockable = locations
      .filter((l) =>
        // The same answer the job-start gate uses (shared clock-gate.ts).
        spaceRunsClock(l.enabledModules as string[] | null, l.organization?.enabledModules as string[] | null),
      )
      .map(({ enabledModules: _m, organization: _o, ...rest }) => rest);
    return { assignments, locations: clockable };
  }

  /**
   * Apply the day's approved changed hours / agreed overtime to a stamp, in place. The rule is
   * the shared `applyApprovedRequests`; a moved end re-arms the clock-out reminder from it.
   */
  applyDayRequests(
    stamp: { expectedClockInAt?: Date; expectedClockOutAt?: Date; nextRemindAt?: Date },
    rows: readonly DayRequestRow[],
    at: { spaceId: string | null; at: Date; tz: string },
  ): { startMoved: boolean; endMoved: boolean } {
    if (!rows.length) return { startMoved: false, endMoved: false };
    const effect = dayRequestEffect(rows, {
      ...at,
      expectedClockInAt: stamp.expectedClockInAt ?? null,
      expectedClockOutAt: stamp.expectedClockOutAt ?? null,
    });
    if (effect.expectedClockInAt) stamp.expectedClockInAt = effect.expectedClockInAt;
    if (effect.expectedClockOutAt) {
      stamp.expectedClockOutAt = effect.expectedClockOutAt;
      stamp.nextRemindAt = new Date(
        Math.max(effect.expectedClockOutAt.getTime(), Date.now()) + SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES * 60_000,
      );
    }
    if (effect.requestIds.length) {
      this.logger.log(`Approved requests applied at clock-in: [${effect.requestIds.join(',')}]`);
    }
    return { startMoved: !!effect.expectedClockInAt, endMoved: !!effect.expectedClockOutAt };
  }

  /**
   * Create a clock-in entry — once.
   *
   * ⚠️ Two constraints can refuse the insert, and they mean different things.
   * The id (the phone sent the same clock-in twice, racing): return that entry.
   * One open shift per member (`time_entries_one_open_per_user`): they are
   * already clocked in — a conflict with the open entry, never a second shift.
   */
  async createEntryOnce(id: string | undefined, userId: string, data: Record<string, unknown>) {
    const include = { location: true, user: { select: { firstName: true, lastName: true } } } as const;
    try {
      return await this.prisma.timeEntry.create({ data: data as never, include });
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      if (id) {
        const same = await this.prisma.timeEntry.findUnique({ where: { id }, include });
        if (same) return sameRecordOrRefuse(same, userId);
      }
      const open = await this.prisma.timeEntry.findFirst({
        where: { userId, status: TimeEntryStatus.CLOCKED_IN },
        include: { location: true },
      });
      if (open) throw alreadyClockedIn(open, true);
      throw err;
    }
  }

  /** Find or create the org's geofence-exempt "Remote" bucket location. */
  async getOrCreateRemoteBucket(organizationId: string) {
    const existing = await this.prisma.companyLocation.findFirst({
      where: { organizationId, isRemote: true },
    });
    if (existing) return existing;
    return this.prisma.companyLocation.create({
      data: { name: 'Remote', organizationId, isRemote: true, isActive: true },
    });
  }
}
