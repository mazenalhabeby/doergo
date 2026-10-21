import { TaskStatus } from '@hbcfield/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';

/** One member's numbers for their page: jobs, attendance, and recent activity. */
@Injectable()
export class EmployeeStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param spaceIds Limit the count to these spaces. Undefined = org-wide, for
   *   an admin or a manager. A supervisor of one site is answering "how is this
   *   person doing HERE", and a career total across sites they cannot see is a
   *   different question they were never granted.
   */
  async getTaskStatsForEmployee(employeeId: string, spaceIds?: string[]) {
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
          OR: [{ dueDate: null }, { updatedAt: { lte: this.prisma.task.fields.dueDate } }],
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
  async getAttendanceStatsForEmployee(employeeId: string, spaceIds?: string[]) {
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
    const weekEntries = monthEntries.filter((e) => new Date(e.clockInAt) >= weekStart);

    const weekHours = weekEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;
    const monthHours = monthEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;

    const geofenceViolations = monthEntries.filter((e) => !e.clockInWithinGeofence).length;

    return {
      totalHoursThisWeek: weekHours,
      totalHoursThisMonth: monthHours,
      shiftsThisWeek: weekEntries.length,
      shiftsThisMonth: monthEntries.length,
      averageShiftHours: monthEntries.length > 0 ? monthHours / monthEntries.length : 0,
      geofenceViolations,
      lateClockIns: 0,
    };
  }

  /**
   * `spaceIds` undefined = org-wide viewer; a list = only jobs and clock-ins in
   * those workspaces (the viewer's), so a supervisor of one site does not read
   * the person's history at every other.
   */
  async getRecentActivityForEmployee(employeeId: string, spaceIds?: string[]) {
    const activities: { id: string; type: string; description: string; timestamp: string }[] = [];

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
    return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
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
