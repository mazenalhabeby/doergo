import { assertMemberInScope, toISODateString, dayKeyIn, tripDistanceOf } from '@hbcfield/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService, TaskStatus, success } from '@hbcfield/shared';
import { GetEmployeePerformanceDto } from './dto';
import { workspaceZone } from '../../common/zone.util';

/** A member's performance: trends by day, compared with the period before. */
@Injectable()
export class MemberPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get detailed performance metrics for an employee
   */
  async getPerformance(dto: GetEmployeePerformanceDto) {
    // A space-granted caller may only read their own crew. The route takes a
    // member id straight from the caller, so this is the boundary.
    await assertMemberInScope(this.prisma, {
      userId: dto.id,
      organizationId: dto.organizationId,
      scopeSpaceIds: (dto as { scopeSpaceIds?: string[] }).scopeSpaceIds,
    });
    const { id, organizationId, startDate, endDate } = dto;

    // Default to last 30 days if no date range provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get tasks in date range
    const tasks = await this.prisma.task.findMany({
      where: {
        assignedToId: id,
        organizationId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        routeStartedAt: true,
        routeEndedAt: true,
        route: { select: { legStartedAt: true, distanceMeters: true } },
        space: { select: { timezone: true } },
      },
    });

    // Get time entries in date range — org-scoped so a foreign userId can't leak
    // another tenant's worked hours (S2). TimeEntry carries organizationId.
    const timeEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: id,
        organizationId,
        clockInAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        totalMinutes: true,
        clockInAt: true,
        location: { select: { timezone: true } },
      },
    });

    // Calculate metrics
    const completed = tasks.filter((t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED).length;
    const total = tasks.length;

    // On-time completions
    const completedOnTime = tasks.filter((t) => {
      if (t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CLOSED) return false;
      if (!t.dueDate) return true;
      return new Date(t.updatedAt) <= new Date(t.dueDate);
    }).length;

    // Total hours worked
    const totalHours = timeEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;

    // Average task duration (from route start to completion)
    const tasksWithDuration = tasks.filter(
      (t) => t.routeStartedAt && (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED),
    );
    const avgTaskDuration =
      tasksWithDuration.length > 0
        ? tasksWithDuration.reduce((sum, t) => {
            const duration = new Date(t.updatedAt).getTime() - new Date(t.routeStartedAt!).getTime();
            return sum + duration / (1000 * 60); // Convert to minutes
          }, 0) / tasksWithDuration.length
        : 0;

    // Total distance traveled
    const totalDistance = tasks.reduce((sum, t) => sum + tripDistanceOf(t.route, t.routeStartedAt), 0);

    // Build daily trends
    const orgZone = await workspaceZone(this.prisma, { organizationId });
    const trends = this.buildDailyTrends(tasks, timeEntries, start, end, orgZone);

    return success({
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      summary: {
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
        avgTaskDuration,
        tasksCompleted: completed,
        totalHoursWorked: totalHours,
        totalDistanceTraveled: totalDistance,
      },
      trends,
      comparison: null, // TODO: Calculate comparison with previous period
    });
  }

  /**
   * Build daily trends from tasks and time entries
   */
  private buildDailyTrends(
    tasks: Array<{
      status: string;
      createdAt: Date;
      updatedAt: Date;
      space?: { timezone: string | null } | null;
    }>,
    timeEntries: Array<{
      totalMinutes: number | null;
      clockInAt: Date;
      location?: { timezone: string | null } | null;
    }>,
    start: Date,
    end: Date,
    /** Where a record's own workspace names no zone. */
    orgZone: string,
  ) {
    const trends: Array<{
      date: string;
      tasksCompleted: number;
      hoursWorked: number;
    }> = [];

    // Create a map for each day
    const dayMap = new Map<string, { tasksCompleted: number; hoursWorked: number }>();

    // Initialize all days in range
    const current = new Date(start);
    while (current <= end) {
      const dateStr = toISODateString(current);
      dayMap.set(dateStr, { tasksCompleted: 0, hoursWorked: 0 });
      current.setDate(current.getDate() + 1);
    }

    // Count completed tasks per day
    for (const task of tasks) {
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CLOSED) {
        // The day it was finished WHERE it was finished — the UTC day put a
        // 00:30 Vienna completion on the day before.
        const dateStr = dayKeyIn(task.updatedAt, task.space?.timezone || orgZone);
        const day = dayMap.get(dateStr);
        if (day) {
          day.tasksCompleted++;
        }
      }
    }

    // Sum hours worked per day
    for (const entry of timeEntries) {
      const dateStr = dayKeyIn(entry.clockInAt, entry.location?.timezone || orgZone);
      const day = dayMap.get(dateStr);
      if (day && entry.totalMinutes) {
        day.hoursWorked += entry.totalMinutes / 60;
      }
    }

    // Convert map to array
    for (const [date, data] of dayMap) {
      trends.push({
        date,
        tasksCompleted: data.tasksCompleted,
        hoursWorked: Math.round(data.hoursWorked * 10) / 10,
      });
    }

    return trends.sort((a, b) => a.date.localeCompare(b.date));
  }
}
