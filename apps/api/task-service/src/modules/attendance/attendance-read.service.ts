import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  paginated,
  TimeEntryStatus,
  activeAssignmentWhere,
  buildSingleDayFilter,
  buildDateRangeFilter,
} from '@hbcfield/shared';
import { scopeWhere, scopeAllows, type AttendanceScope } from '@hbcfield/shared';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { PresenceService } from './presence/presence.service';
import { ATTENDANCE_LOCATION_SELECT, EDITOR_SELECT } from './attendance-selects';
import { ClockInService } from './clock-in.service';
import { HeartbeatService } from './heartbeat.service';

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
    private readonly clockIns: ClockInService,
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
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
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
    const awayTagged = await this.clockIns.tagAwayAllowed(
      assignments.map((a) => a.space),
      data.userId,
      data.organizationId,
      // The per-workspace overrides, from the rows just read.
      new Map(assignments.map((a) => [a.spaceId, a.allowRemote])),
    );
    // Only asked when it could matter: a member on the clock is not choosing where to clock in.
    const assignedLocations = currentEntry
      ? awayTagged
      : await this.clockIns.tagClockInContext(awayTagged, data.userId, new Date(), new Set(assignments.filter((a) => a.isPrimary).map((a) => a.spaceId)));

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

    const where: any = {
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

  /**
   * Get time entries for a location (admin view)
   */
  async getLocationEntries(data: {
    locationId: string;
    organizationId: string;
    date?: Date | string;
    startDate?: Date | string;
    endDate?: Date | string;
    search?: string;
    page?: number;
    limit?: number;
    requesterId?: string;
    /**
     * Where the caller holds `canViewSpaceAttendance`: null = org-wide (admins
     * included), [ids] = those workspaces, [] = none. Required, not optional —
     * a forgotten scope must not read as "org-wide".
     */
    viewScopeSpaceIds: AttendanceScope;
    sortBy?: string;
    sortOrder?: string;
    sharedSpaceIds?: string[]; // shared spaces (with showAttendance) the caller may view
  }) {
    // A guest may read the attendance of a space shared with them (showAttendance
    // gated at the gateway → only such spaces reach here). Otherwise strict org.
    const isShared = Array.isArray(data.sharedSpaceIds) && data.sharedSpaceIds.includes(data.locationId);
    const location = await this.prisma.companyLocation.findFirst({
      where: isShared ? { id: data.locationId } : { id: data.locationId, organizationId: data.organizationId },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    // Authorization. A cross-org shared grant (showAttendance) confers view for
    // that space. Otherwise the caller must hold `canViewSpaceAttendance` —
    // org-wide, or in THIS workspace through an assignment that is active now.
    //
    // ⚠️ It used to be "has any SpaceAssignment row here": an ended assignment
    // (effectiveTo in the past) still read the roster's hours, and so did an
    // External Observer, whose role grants no attendance at all. Being on a
    // workspace is not the permission to read its people's clock-ins; the
    // External Supervisor keeps access because its role grants exactly this.
    if (!isShared && !(await this.mayViewSpaceAttendance(data.locationId, data.requesterId, data.viewScopeSpaceIds))) {
      // 404, the answer for a workspace that does not exist — a 403 confirms it does.
      throw new NotFoundException('Location not found');
    }

    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 50);
    const skip = (page - 1) * limit;

    // A startDate/endDate range takes precedence; otherwise a single day
    // (defaulting to today when nothing is provided).
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    const where: any = {
      locationId: data.locationId,
      clockInAt: range ?? buildSingleDayFilter(data.date || new Date().toISOString()),
    };

    // Name / email search
    if (data.search?.trim()) {
      const q = data.search.trim();
      where.user = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          editedBy: { select: EDITOR_SELECT },
        },
        orderBy: this.buildEntriesOrderBy(data.sortBy, data.sortOrder),
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * May this caller read the attendance of one workspace?
   *
   * `scope` is where they hold `canViewSpaceAttendance` (null = org-wide). A
   * space-scoped grant comes from a space assignment, so it is honoured only
   * while that assignment is active (`activeAssignmentWhere` — the same window
   * the clock-in uses): a supervisor whose engagement ended yesterday reads
   * nothing today, whatever a cached session still says.
   */
  private async mayViewSpaceAttendance(spaceId: string, userId: string | undefined, scope: AttendanceScope): Promise<boolean> {
    if (scope === null || scope === undefined) return true;
    if (!userId || !scopeAllows(scope, spaceId)) return false;
    const active = await this.prisma.spaceAssignment.findFirst({
      where: { spaceId, ...activeAssignmentWhere(userId) },
      select: { id: true },
    });
    return !!active;
  }

  /**
   * Who is clocked in RIGHT NOW, org-wide — answers the dashboard "on duty"
   * question independently of clock-in date. A shift that started before
   * midnight and is still open (overnight / long / forgot-to-clock-out) must
   * still count, so this filters on the open state (`status = CLOCKED_IN`),
   * NOT on a date window. Backed by the `[organizationId, status]` index and a
   * narrow select (only what the dashboard reads) → O(open entries), tiny
   * payload. No pagination: the open set is always small.
   */
  async getActiveEntries(data: { organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: data.organizationId,
        status: 'CLOCKED_IN',
        // Only the spaces this caller was granted — see attendance-scope.ts.
        ...scopeWhere(data.scopeSpaceIds),
      },
      select: {
        id: true,
        userId: true,
        locationId: true,
        clockInAt: true,
        clockOutAt: true,
        status: true,
        isRemote: true,
      },
      orderBy: { clockInAt: 'desc' },
    });
    return success(entries);
  }

  /**
   * Today's entries for MANY locations in 2-3 queries (vs 4-per-location) —
   * backs the dashboard. The SAME rule as the single workspace read
   * (`getLocationEntries` / `mayViewSpaceAttendance`): `canViewSpaceAttendance`
   * org-wide, or in that workspace through an assignment active now.
   *
   * ⚠️ It used to be "has a roster row here" (ended assignments included), so an
   * External Observer — whose role grants no attendance at all — and anybody
   * rotated off a site read its people's clock-ins. A space the caller may not
   * read is simply left out of the batch.
   */
  async getLocationEntriesBatch(data: {
    locationIds: string[];
    organizationId: string;
    date?: Date | string;
    requesterId?: string;
    /**
     * Where the caller holds `canViewSpaceAttendance`: null = org-wide (admins
     * included), [ids] = those workspaces, [] = none. Required — a forgotten
     * scope must not read as "org-wide".
     */
    viewScopeSpaceIds: AttendanceScope;
  }) {
    const ids = (data.locationIds || []).filter(Boolean);
    if (!ids.length) return success([]);

    const scope = data.viewScopeSpaceIds;
    const asked = scope === null ? ids : ids.filter((id) => scopeAllows(scope, id));
    if (!asked.length || (scope !== null && !data.requesterId)) return success([]);

    const locs = await this.prisma.companyLocation.findMany({
      where: { id: { in: asked }, organizationId: data.organizationId },
      select: { id: true },
    });
    let validIds = locs.map((l) => l.id);

    if (scope !== null && validIds.length) {
      // A space-scoped grant comes from an assignment: honoured only while it is active.
      const active = await this.prisma.spaceAssignment.findMany({
        where: { ...activeAssignmentWhere(data.requesterId!), spaceId: { in: validIds } },
        select: { spaceId: true },
      });
      const allowed = new Set(active.map((m) => m.spaceId));
      validIds = validIds.filter((id) => allowed.has(id));
    }
    if (!validIds.length) return success([]);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        locationId: { in: validIds },
        // Today's entries PLUS any still-open shift (even one that started before
        // midnight) so overnight clock-ins stay "on duty" after the date rolls.
        OR: [
          { clockInAt: buildSingleDayFilter(data.date || new Date().toISOString()) },
          { status: 'CLOCKED_IN' },
        ],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        editedBy: { select: EDITOR_SELECT },
      },
      orderBy: { clockInAt: 'desc' },
      take: 500,
    });
    return success(entries);
  }

  /**
   * Get all time entries for an organization (admin view)
   */
  /**
   * Map a UI sort key → Prisma orderBy for the entries list. Defaults to newest
   * clock-in first. `totalMinutes`/`clockOutAt` are nullable → nulls sort last.
   */
  private buildEntriesOrderBy(sortBy?: string, sortOrder?: string): any {
    const dir: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';
    // Smart "sort by day": every non-chronological sort gets clock-in (newest day
    // first) as a secondary tie-breaker, so a worker's / status's rows always fall
    // into day order instead of an arbitrary within-group order. Invisible in the
    // UI — same columns, same rows — but the list is always day-coherent.
    const byDay = { clockInAt: 'desc' as const };
    switch (sortBy) {
      case 'worker':
        return [{ user: { firstName: dir } }, { user: { lastName: dir } }, byDay];
      case 'status':
        return [{ status: dir }, byDay];
      case 'clockIn':
        return { clockInAt: dir };
      case 'clockOut':
        return [{ clockOutAt: { sort: dir, nulls: 'last' } }, byDay];
      case 'duration':
        return [{ totalMinutes: { sort: dir, nulls: 'last' } }, byDay];
      case 'approval':
        return [{ approvalStatus: dir }, byDay];
      default:
        return byDay;
    }
  }

  async getAllEntries(data: {
    organizationId: string;
    /** Spaces the caller may read; null/undefined = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    date?: Date | string;
    startDate?: Date | string;
    endDate?: Date | string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = clampListPage(data.page);
    /*
      Capped at 500, not the usual 200: the phone's Crew card
      (`getClockedInAll`) pages this at 500 and reads a SHORT page as the end.
      A 200 cap would answer page 1 with 200 rows and the card would stop there
      — silently counting 200 people on the clock when there are more.
    */
    const limit = clampListLimit(data.limit, 50, 500);
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: data.organizationId,
      // Only the spaces this caller was granted — see attendance-scope.ts. The
      // gateway guard widens on any space grant; this is what narrows again.
      ...scopeWhere(data.scopeSpaceIds),
    };

    // Date filter — a startDate/endDate range takes precedence over a single day.
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    if (range) {
      where.clockInAt = range;
    } else if (data.date) {
      where.clockInAt = buildSingleDayFilter(data.date);
    }

    // Status filter
    if (data.status) {
      where.status = data.status;
    }

    // Name / email search
    if (data.search?.trim()) {
      const q = data.search.trim();
      where.user = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              address: true,
              timezone: true,
            },
          },
          editedBy: { select: EDITOR_SELECT },
        },
        orderBy: this.buildEntriesOrderBy(data.sortBy, data.sortOrder),
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }
}
