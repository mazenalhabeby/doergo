import { Injectable, NotFoundException } from '@nestjs/common';
import {
  success,
  paginated,
  activeAssignmentWhere,
  buildSingleDayFilter,
  buildDateRangeFilter,
  personSearchOr,
} from '@hbcfield/shared';
import { scopeWhere, scopeAllows, type AttendanceScope } from '@hbcfield/shared';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { EDITOR_SELECT, MEMBER_SELECT } from '../core/attendance-selects';
import { AttendanceReadBase } from './attendance-read.base';
import type { Prisma, TimeEntryStatus } from '@prisma/client';

/**
 * Reading many people's entries: one workspace's, every workspace's at once, who
 * is on the clock now, and the organization's whole list.
 */
@Injectable()
export class AttendanceEntriesReadService extends AttendanceReadBase {

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
    const where: Prisma.TimeEntryWhereInput = {
      locationId: data.locationId,
      clockInAt: range ?? buildSingleDayFilter(data.date || new Date().toISOString()),
    };

    // Name / email search
    const nameMatch = personSearchOr(data.search);
    if (nameMatch) where.user = { OR: nameMatch };

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: MEMBER_SELECT },
          editedBy: { select: EDITOR_SELECT },
        },
        orderBy: this.buildEntriesOrderBy(data.sortBy, data.sortOrder),
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
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
        user: { select: MEMBER_SELECT },
        editedBy: { select: EDITOR_SELECT },
      },
      orderBy: { clockInAt: 'desc' },
      take: 500,
    });
    return success(entries);
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

    const where: Prisma.TimeEntryWhereInput = {
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
      where.status = data.status as TimeEntryStatus;
    }

    // Name / email search
    const nameMatch = personSearchOr(data.search);
    if (nameMatch) where.user = { OR: nameMatch };

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: MEMBER_SELECT },
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
