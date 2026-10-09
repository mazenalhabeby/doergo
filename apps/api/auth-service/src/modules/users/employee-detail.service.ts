import { Role, TaskStatus } from '@hbcfield/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GetEmployeeDetailDto } from './dto';
import { isOnline } from './users-common';

/**
 * One employee's detail page: the record, their task and attendance figures, and
 * the recent-activity feed narrowed to what the viewer may see.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class EmployeeDetailService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get full employee detail with stats
   */
  async getEmployeeDetail(dto: GetEmployeeDetailDto) {
    const { id, organizationId } = dto;
    /*
      Who is allowed to read a colleague's record, and how much of it.

      This endpoint had NO permission guard: any authenticated member could
      fetch any other member's full profile — every task they have completed
      across every space, their hours, their recent activity and their last GPS
      position. For an external member that is a client's supervisor reading the
      complete work history of people at sites they have nothing to do with.

      `viewerSpaceIds` is null for an org-wide viewer (an admin or a manager) and
      the caller's granted spaces otherwise. Undefined means an older caller that
      sends nothing, which is treated as org-wide so existing internal callers
      are unaffected — the gateway sends it on the one route a member reaches.
    */
    const viewerSpaceIds = (dto as { viewerSpaceIds?: string[] | null }).viewerSpaceIds;
    const scoped = Array.isArray(viewerSpaceIds);
    // Coordinates need their own permission — see lastLocation below. Absent
    // fails CLOSED: an org-wide viewer of the roster is not, by that alone,
    // somebody who may follow a colleague on a map.
    const canSeeLocation = (dto as { canViewTracking?: boolean }).canViewTracking === true;

    const employee = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.EMPLOYEE,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        // Their worker statistics are structurally zero — see EmployeeProfile.
        isExternal: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        position: true,
        enabledModules: true,
        /*
          The account-level grant for working away from a site.

          Read by the member's Workspaces tab, which resolves the EFFECTIVE
          answer per assignment from the site's ceiling, this flag, and any
          per-assignment override. Missing, that screen renders "Refused" for
          somebody whose account allows it — a wrong answer shown to the one
          person who would then go and change the wrong setting.
        */
        allowRemote: true,
        specialty: true,
        employmentType: true,
        rating: true,
        ratingCount: true,
        maxDailyJobs: true,
        canCreateTasks: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        lastLocation: {
          select: {
            lat: true,
            lng: true,
            accuracy: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Batch all stats queries in parallel to avoid N+1
    if (scoped) {
      // Reachable only through a space they were both put in. Reads as "not
      // found" rather than "forbidden": whether a given colleague exists is
      // itself something this caller has no business learning.
      const shared = await this.prisma.spaceAssignment.findFirst({
        where: { userId: id, spaceId: { in: viewerSpaceIds as string[] } },
        select: { id: true },
      });
      if (!shared) throw new NotFoundException('Employee not found');
    }

    const [taskStats, attendanceStats, recentActivity] = await Promise.all([
      // Scoped to the spaces the viewer holds, so a supervisor of one site sees
      // that site's work and not a career total.
      this.getTaskStatsForEmployee(id, scoped ? (viewerSpaceIds as string[]) : undefined),
      this.getAttendanceStatsForEmployee(id, scoped ? (viewerSpaceIds as string[]) : undefined),
      // ⚠️ The activity feed too — it named every job and every site the person
      // had been at, whatever the viewer's spaces. Same scope as the numbers.
      this.getRecentActivityForEmployee(id, scoped ? (viewerSpaceIds as string[]) : undefined),
    ]);

    // Build response
    const profile = {
      id: employee.id,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      isActive: employee.isActive,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
      position: employee.position,
      enabledModules: employee.enabledModules as string[] | null,
      specialty: employee.specialty,
      employmentType: employee.employmentType ?? 'EXTERNAL',
      rating: employee.rating || 5.0,
      ratingCount: employee.ratingCount || 0,
      maxDailyJobs: employee.maxDailyJobs || 5,
      canCreateTasks: employee.canCreateTasks,
      organizationId: employee.organizationId,
      organization: employee.organization,
      /*
        Where this person physically is — the most sensitive field here, and it
        was returned to anybody who asked.

        `canViewTracking` exists for exactly this and was split out of
        canViewAllTasks because "read a task list" and "track a person's
        location" are not the same permission. Without it the coordinates are
        withheld and `isOnline` still answers the question a roster actually
        asks: are they around?
      */
      lastLocation:
        canSeeLocation && employee.lastLocation
          ? {
              lat: employee.lastLocation.lat,
              lng: employee.lastLocation.lng,
              accuracy: employee.lastLocation.accuracy,
              updatedAt: employee.lastLocation.updatedAt.toISOString(),
            }
          : null,
      // When they were last seen is not a position — it is what `isOnline` is
      // made of, and a roster may show it without the map permission.
      lastLocationUpdatedAt: employee.lastLocation?.updatedAt?.toISOString() || null,
      isOnline: isOnline(employee.lastLocation?.updatedAt),
      currentTaskCount: taskStats.inProgress,
      todayTaskCount: taskStats.todayTotal,
      completedTaskCount: taskStats.completed,
    };

    const stats = {
      tasks: taskStats,
      attendance: attendanceStats,
      performance: {
        completionRate: taskStats.completionRate,
        onTimeRate: taskStats.onTimeRate,
        customerRating: employee.rating || 5.0,
        ratingCount: employee.ratingCount || 0,
      },
      recentActivity,
    };

    return {
      success: true,
      data: {
        ...profile,
        stats,
      },
    };
  }

  /**
   * @param spaceIds Limit the count to these spaces. Undefined = org-wide, for
   *   an admin or a manager. A supervisor of one site is answering "how is this
   *   person doing HERE", and a career total across sites they cannot see is a
   *   different question they were never granted.
   */
  private async getTaskStatsForEmployee(employeeId: string, spaceIds?: string[]) {
    const spaceFilter = spaceIds ? { spaceId: { in: spaceIds } } : {};
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Use aggregation queries instead of fetching all tasks into memory
    const [statusCounts, priorityCounts, todayCount] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: { assignedToId: employeeId, ...spaceFilter },
        _count: { status: true },
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: { assignedToId: employeeId, ...spaceFilter },
        _count: { priority: true },
      }),
      this.prisma.task.count({
        where: {
          assignedToId: employeeId,
          createdAt: { gte: todayStart },
          ...spaceFilter,
        },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    let completed = 0;
    let inProgress = 0;
    let assigned = 0;

    for (const sc of statusCounts) {
      byStatus[sc.status] = sc._count.status;
      total += sc._count.status;

      if (sc.status === TaskStatus.COMPLETED || sc.status === TaskStatus.CLOSED) {
        completed += sc._count.status;
      }
      if (
        sc.status === TaskStatus.EN_ROUTE ||
        sc.status === TaskStatus.ARRIVED ||
        sc.status === TaskStatus.IN_PROGRESS
      ) {
        inProgress += sc._count.status;
      }
      if (sc.status === TaskStatus.ASSIGNED) {
        assigned += sc._count.status;
      }
    }

    const byPriority: Record<string, number> = {};
    for (const pc of priorityCounts) {
      byPriority[pc.priority] = pc._count.priority;
    }

    // On-time rate: a single filtered count (field-ref updatedAt <= dueDate) over
    // the SAME all-time set as `completed`, so numerator and denominator share a
    // window (D7 — was a 90-day numerator over an all-time denominator, which
    // understated on-time for anyone with older completions). Replaces the old
    // take:200 findMany+JS filter (M5).
    let completedOnTime = 0;
    if (completed > 0) {
      completedOnTime = await this.prisma.task.count({
        where: {
          assignedToId: employeeId,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] },
          OR: [
            { dueDate: null },
            { updatedAt: { lte: this.prisma.task.fields.dueDate } },
          ],
        },
      });
    }

    return {
      total,
      completed,
      inProgress,
      assigned,
      completedOnTime,
      avgCompletionTimeMinutes: 0,
      byStatus,
      byPriority,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
      todayTotal: todayCount,
    };
  }

  /** @param spaceIds Limit to these sites — see getTaskStatsForEmployee. */
  private async getAttendanceStatsForEmployee(employeeId: string, spaceIds?: string[]) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Batch both queries in parallel - month entries include week entries
    const monthEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: employeeId,
        clockInAt: { gte: monthStart },
        // Hours worked at the sites this viewer supervises, not everywhere.
        ...(spaceIds ? { locationId: { in: spaceIds } } : {}),
      },
      select: {
        totalMinutes: true,
        clockInWithinGeofence: true,
        clockInAt: true,
      },
    });

    // Filter week entries from month entries to avoid a second query
    const weekEntries = monthEntries.filter(
      (e) => new Date(e.clockInAt) >= weekStart,
    );

    const weekHours =
      weekEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;
    const monthHours =
      monthEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;

    const geofenceViolations = monthEntries.filter(
      (e) => !e.clockInWithinGeofence,
    ).length;

    return {
      totalHoursThisWeek: weekHours,
      totalHoursThisMonth: monthHours,
      shiftsThisWeek: weekEntries.length,
      shiftsThisMonth: monthEntries.length,
      averageShiftHours:
        monthEntries.length > 0 ? monthHours / monthEntries.length : 0,
      geofenceViolations,
      lateClockIns: 0,
    };
  }

  /**
   * `spaceIds` undefined = org-wide viewer; a list = only jobs and clock-ins in
   * those workspaces (the viewer's), so a supervisor of one site does not read
   * the person's history at every other.
   */
  private async getRecentActivityForEmployee(employeeId: string, spaceIds?: string[]) {
    const activities: any[] = [];

    // Get recent task events
    const taskEvents = await this.prisma.taskEvent.findMany({
      where: { userId: employeeId, ...(spaceIds ? { task: { spaceId: { in: spaceIds } } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        createdAt: true,
        task: {
          select: { title: true },
        },
      },
    });

    for (const event of taskEvents) {
      activities.push({
        id: event.id,
        type: this.mapEventTypeToActivityType(event.eventType),
        description: `${event.eventType} - ${event.task.title}`,
        timestamp: event.createdAt.toISOString(),
      });
    }

    // Get recent time entries
    const timeEntries = await this.prisma.timeEntry.findMany({
      where: { userId: employeeId, ...(spaceIds ? { locationId: { in: spaceIds } } : {}) },
      orderBy: { clockInAt: 'desc' },
      take: 5,
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        location: {
          select: { name: true },
        },
      },
    });

    for (const entry of timeEntries) {
      activities.push({
        id: `clock-in-${entry.id}`,
        type: 'CLOCK_IN',
        description: `Clocked in at ${entry.location.name}`,
        timestamp: entry.clockInAt.toISOString(),
      });
      if (entry.clockOutAt) {
        activities.push({
          id: `clock-out-${entry.id}`,
          type: 'CLOCK_OUT',
          description: `Clocked out from ${entry.location.name}`,
          timestamp: entry.clockOutAt.toISOString(),
        });
      }
    }

    // Sort by timestamp and take top 10
    return activities
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 10);
  }

  private mapEventTypeToActivityType(eventType: string): string {
    switch (eventType) {
      case 'STATUS_CHANGED':
        return 'TASK_STARTED';
      case 'ASSIGNED':
        return 'TASK_ASSIGNED';
      case 'COMPLETED':
        return 'TASK_COMPLETED';
      default:
        return 'TASK_STARTED';
    }
  }
}
