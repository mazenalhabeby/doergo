import { Injectable, NotFoundException } from '@nestjs/common';
import { notEndedWhere, success, paginated, TimeEntryStatus, buildDateRangeFilter } from '@hbcfield/shared';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { ATTENDANCE_LOCATION_SELECT } from './attendance-selects';
import { AttendanceReadBase } from './attendance-read.base';
import type { Prisma } from '@prisma/client';

/**
 * Reading attendance: the caller's running shift, their history, a
 * workspace's entries (one or a batch), who is clocked in now, the whole
 * organization's entries, and one entry's presence trail.
 */
@Injectable()
export class AttendanceReadService extends AttendanceReadBase {

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
    // Get current clock-in entry if any
    const currentEntry = await this.prisma.timeEntry.findFirst({
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
      },
    });

    // Get assigned locations
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: data.userId,
        ...notEndedWhere(),
      },
      // `allowRemote` rides along on rows this endpoint already reads. Without
      // it, tagging the workspaces below re-queries this very table — a second
      // trip for a column that was one word away, on the endpoint a phone polls
      // all day.
      include: {
        space: { select: ATTENDANCE_LOCATION_SELECT },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

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
    const assignedLocations = currentEntry
      ? awayTagged
      : await this.clockInLocations.tagClockInContext(
          awayTagged,
          data.userId,
          new Date(),
          new Set(assignments.filter((a) => a.isPrimary).map((a) => a.spaceId)),
        );

    // Active out-of-ring excursion for the current session (drives mobile UI).
    const activeExcursion = currentEntry ? await this.heartbeats.getActiveExcursion(currentEntry.id) : null;

    /*
      A shift the sweep closed with a temporary time, still waiting for the
      member to say when they left. One indexed read (partial, provisional
      rows only), newest within two weeks.
    */
    const unconfirmedClockOut = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        clockOutProvisional: true,
        clockOutAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
      },
      orderBy: { clockOutAt: 'desc' },
      select: {
        id: true, clockInAt: true, clockOutAt: true, clockOutBasis: true, expectedClockOutAt: true, timezone: true,
        location: { select: { id: true, name: true, timezone: true } },
      },
    });

    return success({
      isClockedIn: !!currentEntry,
      currentEntry,
      assignedLocations,
      activeExcursion,
      unconfirmedClockOut,
    });
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
