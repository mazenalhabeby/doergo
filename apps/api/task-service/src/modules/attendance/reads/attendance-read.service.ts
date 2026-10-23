import { Injectable, NotFoundException } from '@nestjs/common';
import {
  notEndedWhere,
  success,
  paginated,
  TimeEntryStatus,
  buildDateRangeFilter,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  zoneOf,
} from '@hbcfield/shared';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { ATTENDANCE_LOCATION_SELECT } from '../core/attendance-selects';
import { isClockableAssignment, STATUS_SPACE_SELECT, statusSpace } from './status-clockable';
import { PrismaService } from '@hbcfield/shared';
import { PresenceService } from '../presence/presence.service';
import { HeartbeatService } from '../on-the-clock/heartbeat.service';
import { ClockInLocationsService } from '../clock-in/clock-in-locations.service';
import type { Prisma } from '@prisma/client';

/**
 * Reading attendance: the caller's running shift, their history, a
 * workspace's entries (one or a batch), who is clocked in now, the whole
 * organization's entries, and one entry's presence trail.
 */
@Injectable()
export class AttendanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    // Where they are working now — display only, and never in the way of a clock-in.
    private readonly presence: PresenceService,
    private readonly clockInLocations: ClockInLocationsService,
    private readonly heartbeats: HeartbeatService,
  ) {}

  /**
   * The day's changes of where somebody worked, for one entry in the caller's
   * spaces. Group, reason and time — never a position. Outside the caller's
   * spaces it is "not found", like every other entry read.
   */
  async getEntryPresence(data: { entryId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
      select: { id: true, clockInAt: true, clockOutAt: true, presence: true, lastSeenAt: true },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    const changes = await this.presence.history(entry.id, data.organizationId);
    return success({ ...entry, changes });
  }

  /**
   * Get current attendance status for a technician
   */
  async getStatus(data: { userId: string; organizationId: string }) {
    /*
      Three independent reads, asked together: the open shift (with its rest in
      progress), the workspaces the member is assigned to, and a shift the sweep
      closed provisionally. One after another they cost three round trips on the
      endpoint the phone polls all day; the answer is the same either way.
    */
    const [currentEntry, assignments, unconfirmedClockOut] = await Promise.all([
      // Get current clock-in entry if any
      this.prisma.timeEntry.findFirst({
        where: {
          userId: data.userId,
          organizationId: data.organizationId,
          status: TimeEntryStatus.CLOCKED_IN,
        },
        include: {
          location: { select: ATTENDANCE_LOCATION_SELECT },
          /*
            The rest in progress, if there is one.

            Only the OPEN one: a closed break is history and the status endpoint
            answers "what is happening right now". Both clients read this to decide
            between "start your rest" and "back to work", which is the whole of the
            rest UI — without it each would need a second request on every poll.
          */
          breaks: {
            where: { endedAt: null },
            select: { id: true, startedAt: true, ruleId: true, isPaid: true, type: true },
            take: 1,
          },
          // The shift's tolerance — the one the server judges early/late by at clock-out.
          shift: { select: { flagToleranceMin: true } },
        },
      }),
      // Get assigned locations
      this.prisma.spaceAssignment.findMany({
        where: {
          userId: data.userId,
          ...notEndedWhere(),
        },
        // `allowRemote` rides along on rows this endpoint already reads. Without
        // it, tagging the workspaces below re-queries this very table — a second
        // trip for a column that was one word away, on the endpoint a phone polls
        // all day.
        include: {
          space: { select: STATUS_SPACE_SELECT },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      /*
        A shift the sweep closed with a temporary time, still waiting for the
        member to say when they left. One indexed read (partial, provisional
        rows only), newest within two weeks.
      */
      this.prisma.timeEntry.findFirst({
        where: {
          userId: data.userId,
          organizationId: data.organizationId,
          clockOutProvisional: true,
          clockOutAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
        },
        orderBy: { clockOutAt: 'desc' },
        select: {
          id: true,
          clockInAt: true,
          clockOutAt: true,
          clockOutBasis: true,
          expectedClockOutAt: true,
          timezone: true,
          location: { select: { id: true, name: true, timezone: true } },
        },
      }),
    ]);

    // Which workspaces would take a clock-in NOW — the clock-in check's own rule (status-clockable.ts).
    const now = new Date();
    const clockableIds = new Set(
      assignments.filter((a) => isClockableAssignment(a, data.organizationId, now)).map((a) => a.spaceId),
    );
    const listed = assignments.map((a) => ({ ...a, space: statusSpace(a.space) }));

    // The workspace tags and the active excursion depend on the reads above, not on each other.
    const [tagged, activeExcursion] = await Promise.all([
      this.tagStatusLocations(currentEntry !== null, listed, data),
      // Active out-of-ring excursion for the current session (drives mobile UI).
      currentEntry ? this.heartbeats.getActiveExcursion(currentEntry.id) : null,
    ]);

    const assignedLocations = tagged.map((l) => ({ ...l, clockable: clockableIds.has(l.id) }));
    // Before clock-in only: the planned shift the card counts down to (next-shift.ts).
    const nextShift = currentEntry
      ? null
      : await this.clockInLocations.nextShiftToday(
          data.userId,
          listed
            .filter((a) => clockableIds.has(a.spaceId))
            .map((a) => ({ ...a.space, timezone: zoneOf(a.space.timezone) })),
          now,
        );

    /*
      The tolerance the clock-out will be judged by, sent with the shift so the
      phone's sheet says "late" / "finishing early" exactly when the server will
      flag it. Without it the sheet used one minute against the server's ten, and
      "Clock out & ask" promised a request the server never created.
    */
    const runningEntry = currentEntry
      ? (({ shift, ...e }) => ({
          ...e,
          flagToleranceMin: shift?.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
          // Left the site and not back: the phone offers it for "I forgot to clock out" (the route takes it).
          leftSiteAt: activeExcursion?.leftRingAt ?? null,
        }))(currentEntry)
      : null;

    return success({
      isClockedIn: !!currentEntry,
      currentEntry: runningEntry,
      assignedLocations,
      nextShift,
      activeExcursion,
      unconfirmedClockOut,
    });
  }

  /** The member's workspaces, tagged for the clock-in choice (status read, see getStatus). */
  private async tagStatusLocations(
    clockedIn: boolean,
    assignments: Prisma.SpaceAssignmentGetPayload<{
      include: { space: { select: typeof ATTENDANCE_LOCATION_SELECT } };
    }>[],
    data: { userId: string; organizationId: string },
  ) {
    /*
      …and whether each would take a clock-in from off site.

      The phone reads this list to decide whether to offer "away" at all, and it
      must answer the same as the clock-in list and the clock-in itself. Without
      it the phone had only the account grant to go on, and offered the option at
      workspaces that require presence.
    */
    const awayTagged = await this.clockInLocations.tagAwayAllowed(
      assignments.map((a) => a.space),
      data.userId,
      data.organizationId,
      // The per-workspace overrides, from the rows just read.
      new Map(assignments.map((a) => [a.spaceId, a.allowRemote])),
    );
    // Only asked when it could matter: a member on the clock is not choosing where to clock in.
    return clockedIn
      ? awayTagged
      : this.clockInLocations.tagClockInContext(
          awayTagged,
          data.userId,
          new Date(),
          new Set(assignments.filter((a) => a.isPrimary).map((a) => a.spaceId)),
        );
  }

  /**
   * Get attendance history for a technician
   */
  async getHistory(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may read; null/undefined = unnarrowed (own history). */
    scopeSpaceIds?: AttendanceScope;
    startDate?: Date | string;
    endDate?: Date | string;
    page?: number;
    limit?: number;
  }) {
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 20);
    const skip = (page - 1) * limit;

    const where: Prisma.TimeEntryWhereInput = {
      userId: data.userId,
      organizationId: data.organizationId,
      /*
        Narrowed only when a scope is passed.

        This method serves two callers: a member reading their OWN history,
        which passes none and must stay complete, and an admin or supervisor
        reading somebody else's through /employees/:id/attendance, which passes
        the spaces they hold. `undefined` meaning "do not narrow" is what lets
        one method do both without a second copy.
      */
      ...scopeWhere(data.scopeSpaceIds),
    };

    // Date range filter. Uses the shared builder so a date-only `endDate`
    // ("2026-08-18") becomes end-of-day rather than midnight — parsing it raw
    // dropped every entry of the last day of the window, i.e. today's session
    // (including the still-open one) never showed up in the history.
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    if (range) {
      where.clockInAt = range;
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          location: { select: ATTENDANCE_LOCATION_SELECT },
          /*
            How many work-log notes each shift carries — the Time tab's "3 notes"
            under a shift. A COUNT, answered in the same query as a correlated
            subquery on the indexed (timeEntryId, at); never the notes, which
            are opened one shift at a time.
          */
          _count: { select: { workLog: true } },
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }
}
