import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, paginated, SERVICE_NAMES, buildDateRangeFilter, buildSingleDayFilter } from '@hbcfield/shared';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { CountedTimeService } from './counted-time.service';

/** Reading rests: one entry's, who is resting now, the history, the summary. */
@Injectable()
export class BreakReadService {
  private readonly logger = new Logger(BreakReadService.name);

  constructor(
    private readonly prisma: PrismaService,
    // A break changes breakMinutes, and paid time is computed from it.
    private readonly countedTime: CountedTimeService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Get breaks for a time entry
   */
  async getBreaksForEntry(data: {
    timeEntryId: string;
    organizationId: string;
    /** The caller — their OWN entry is always theirs to read. */
    requesterId: string;
    /** Where the caller holds canViewSpaceAttendance; null = org-wide, [] = none. */
    scopeSpaceIds: AttendanceScope;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.timeEntryId,
        organizationId: data.organizationId,
        // The same rule as reading the entry: the member's own, or one in a
        // space where the caller may read attendance. Anything else reads as
        // 'not found' — a 403 would confirm the entry exists.
        OR: [{ userId: data.requesterId }, scopeWhere(data.scopeSpaceIds)],
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    const breaks = await this.prisma.break.findMany({
      where: { timeEntryId: data.timeEntryId },
      // Who entered it, when it was not the member — the same distinction the
      // history and active listings carry. Without it this endpoint could not
      // tell a manually-added break from one somebody took.
      include: { addedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startedAt: 'asc' },
    });

    const totalMinutes = breaks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

    return success({
      breaks,
      totalBreakMinutes: totalMinutes,
      breakCount: breaks.length,
    });
  }

  /**
   * Get all active breaks in the organization (admin view)
   */
  async getActiveBreaks(data: { organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const breaks = await this.prisma.break.findMany({
      where: {
        endedAt: null, // Active breaks
        timeEntry: {
          organizationId: data.organizationId,
          // Only the caller's granted spaces — see attendance-scope.ts.
          ...scopeWhere(data.scopeSpaceIds),
        },
      },
      include: {
        // See getBreakHistory — the same distinction matters on a live break.
        addedBy: { select: { id: true, firstName: true, lastName: true } },
        timeEntry: {
          include: {
            user: {
              select: {
                id: true, firstName: true, lastName: true, email: true,
              },
            },
            /*
              ⚠️ NOT `location: true`. That shipped the whole workspace row —
              cost and bill rates, contact details, the geofence polygon —
              TWICE per break (here and flattened below), every minute, to
              anybody holding `canViewSpaceAttendance` in one space, an
              external supervisor included. ~3.6 KB per break for a name
              and a time zone. Readers use id, name, address, timezone.
            */
            location: { select: { id: true, name: true, address: true, timezone: true } },
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Flatten the structure for easier consumption
    const flattenedBreaks = breaks.map((b) => ({
      ...b,
      user: b.timeEntry?.user,
      location: b.timeEntry?.location,
    }));

    return success(flattenedBreaks);
  }

  /**
   * Get break history with filters (admin view)
   */
  async getBreakHistory(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    organizationId: string;
    date?: string;
    userId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 50);
    const skip = (page - 1) * limit;

    // Build date filter using shared utility
    const dateFilter = data.date ? { startedAt: buildSingleDayFilter(data.date) } : {};

    // Build where clause
    const where: any = {
      ...dateFilter,
      timeEntry: {
        organizationId: data.organizationId,
        // Only the caller's granted spaces — see attendance-scope.ts.
        ...scopeWhere(data.scopeSpaceIds),
        ...(data.userId ? { userId: data.userId } : {}),
      },
      ...(data.type ? { type: data.type } : {}),
    };

    const [breaks, total] = await Promise.all([
      this.prisma.break.findMany({
        where,
        include: {
          /*
            Who entered this, when it was not the member.

            NULL for a break somebody recorded themselves, which is almost all of
            them. Selected here because the reason for storing it at all is that a
            reader can tell the two apart — an audit trail nobody can see is a
            column, not an audit trail.
          */
          addedBy: { select: { id: true, firstName: true, lastName: true } },
          timeEntry: {
            include: {
              user: {
                select: {
                  id: true, firstName: true, lastName: true, email: true,
                },
              },
              location: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.break.count({ where }),
    ]);

    // Flatten the structure
    const flattenedBreaks = breaks.map((b) => ({
      ...b,
      user: b.timeEntry?.user,
      location: b.timeEntry?.location,
    }));

    return paginated(flattenedBreaks, {
      total,
      page,
      limit,
    });
  }

  /**
   * Get break summary statistics for a date range
   */
  async getBreakSummary(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    organizationId: string;
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    const dateFilter = buildDateRangeFilter(data.startDate, data.endDate);

    // Build where clause
    const where: any = {
      startedAt: dateFilter,
      timeEntry: {
        organizationId: data.organizationId,
        // Only the caller's granted spaces — see attendance-scope.ts.
        ...scopeWhere(data.scopeSpaceIds),
        ...(data.userId ? { userId: data.userId } : {}),
      },
      durationMinutes: { not: null }, // Only completed breaks
    };

    // Get all breaks in the period
    const breaks = await this.prisma.break.findMany({
      where,
      select: {
        type: true,
        durationMinutes: true,
      },
    });

    // Calculate statistics
    const totalBreaks = breaks.length;
    const totalBreakMinutes = breaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );
    const averageBreakMinutes =
      totalBreaks > 0 ? Math.round(totalBreakMinutes / totalBreaks) : 0;

    // Group by type
    const breaksByType = {
      LUNCH: { count: 0, totalMinutes: 0 },
      SHORT: { count: 0, totalMinutes: 0 },
      OTHER: { count: 0, totalMinutes: 0 },
    };

    for (const b of breaks) {
      const type = b.type as 'LUNCH' | 'SHORT' | 'OTHER';
      if (breaksByType[type]) {
        breaksByType[type].count++;
        breaksByType[type].totalMinutes += b.durationMinutes || 0;
      }
    }

    // Calculate averages per type
    for (const type of Object.keys(breaksByType) as Array<'LUNCH' | 'SHORT' | 'OTHER'>) {
      if (breaksByType[type].count > 0) {
        (breaksByType[type] as any).averageMinutes = Math.round(
          breaksByType[type].totalMinutes / breaksByType[type].count,
        );
      } else {
        (breaksByType[type] as any).averageMinutes = 0;
      }
    }

    return success({
      period: {
        startDate: data.startDate,
        endDate: data.endDate,
      },
      totalBreaks,
      totalBreakMinutes,
      averageBreakMinutes,
      breaksByType,
    });
  }
}
