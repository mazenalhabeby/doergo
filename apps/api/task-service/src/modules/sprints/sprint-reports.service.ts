import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  clampListLimit,
  localPartsIn,
  addDaysStr,
  zonedWallTimeToUtc,
  assertFoundInOrg,
} from '@hbcfield/shared';
import type { Prisma } from '@prisma/client';

/**
 * What a sprint achieved: the report written when it completes, its daily
 * burndown, reading it back, and the team's velocity.
 */
/** What a sprint report reads of each task in the sprint. */
type SprintReportTask = { id: string; status: string; storyPoints: number | null; createdAt: Date | string };

@Injectable()
export class SprintReportsService {

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate a sprint report with burndown data, committed/completed stats
   */
  async generateSprintReport(
    tx: Prisma.TransactionClient,
    sprint: { tasks?: SprintReportTask[] | null },
    sprintMeta: { id: string; organizationId: string; startDate: Date; endDate: Date; timezone: string },
  ) {
    const tasks = sprint.tasks || [];

    // Completed statuses (final states)
    const COMPLETED_STATUSES = ['COMPLETED', 'CLOSED'];
    const CANCELED_STATUSES = ['CANCELED'];

    // Count committed tasks (those that were in the sprint)
    const committedTasks = tasks.length;
    const committedPoints = tasks.reduce(
      (sum: number, t) => sum + (t.storyPoints || 0),
      0,
    );

    // Count completed tasks
    const completedTasksList = tasks.filter((t) =>
      COMPLETED_STATUSES.includes(t.status),
    );
    const completedTasks = completedTasksList.length;
    const completedPoints = completedTasksList.reduce(
      (sum: number, t) => sum + (t.storyPoints || 0),
      0,
    );

    // Count carried over (not completed and not canceled)
    const carriedOverList = tasks.filter(
      (t) =>
        !COMPLETED_STATUSES.includes(t.status) &&
        !CANCELED_STATUSES.includes(t.status),
    );
    const carriedOverTasks = carriedOverList.length;
    const carriedOverPoints = carriedOverList.reduce(
      (sum: number, t) => sum + (t.storyPoints || 0),
      0,
    );

    // Count tasks added mid-sprint (created after sprint start)
    const addedMidSprint = tasks.filter(
      (t) => new Date(t.createdAt) > sprintMeta.startDate,
    ).length;

    // Build daily burndown from task status change events
    const dailyBurndown = await this.buildDailyBurndown(
      tx,
      tasks,
      sprintMeta.startDate,
      sprintMeta.endDate,
      committedPoints,
      sprintMeta.timezone,
    );

    const report = await tx.sprintReport.create({
      data: {
        sprintId: sprintMeta.id,
        organizationId: sprintMeta.organizationId,
        committedPoints,
        completedPoints,
        committedTasks,
        completedTasks,
        carriedOverTasks,
        carriedOverPoints,
        addedMidSprint,
        removedMidSprint: 0, // Would require tracking task removals from sprints
        velocity: completedPoints,
        dailyBurndown,
      },
    });

    return report;
  }

  /**
   * Build daily burndown data from task events during the sprint period.
   * For each day, calculates remaining story points based on status change events.
   */
  private async buildDailyBurndown(
    tx: Prisma.TransactionClient,
    tasks: SprintReportTask[],
    startDate: Date,
    endDate: Date,
    totalPoints: number,
    timezone = 'UTC',
  ): Promise<{ date: string; remaining: number; ideal: number }[]> {
    const taskIds = tasks.map((t) => t.id);

    // Get all STATUS_CHANGED events for sprint tasks during the sprint period
    const statusEvents = taskIds.length > 0
      ? await tx.taskEvent.findMany({
          where: {
            taskId: { in: taskIds },
            eventType: 'STATUS_CHANGED',
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            taskId: true,
            metadata: true,
            createdAt: true,
          },
        })
      : [];

    // Build a map of task points
    const taskPointsMap = new Map<string, number>();
    for (const task of tasks) {
      taskPointsMap.set(task.id, task.storyPoints || 0);
    }

    // Calculate day-by-day burndown
    const COMPLETED_STATUSES = ['COMPLETED', 'CLOSED'];
    const burndown: { date: string; remaining: number; ideal: number }[] = [];

    /*
      Days are walked as LOCAL dates in the workspace's zone (shared zoned-time),
      not with setHours on the server's clock: in UTC a Vienna sprint's "day"
      ran 01:00–01:00 and a completion at 00:30 landed on the previous day.
    */
    const firstDay = localPartsIn(startDate, timezone).dateStr;
    const lastDay = localPartsIn(endDate, timezone).dateStr;
    const days: string[] = [];
    for (let d = firstDay; d <= lastDay; d = addDaysStr(d, 1)) days.push(d);

    // Calculate total sprint days for ideal line
    const totalDays = Math.max(1, days.length);

    // Track which tasks are completed by each day
    const completedTaskIds = new Set<string>();
    let eventIndex = 0;
    let dayCount = 0;

    for (const day of days) {
      // The instant the local day ends (next local midnight, exclusive).
      const dayEnd = zonedWallTimeToUtc(addDaysStr(day, 1), 0, 0, timezone);

      // Process events up to this day
      while (
        eventIndex < statusEvents.length &&
        new Date(statusEvents[eventIndex]!.createdAt) < dayEnd
      ) {
        const event = statusEvents[eventIndex]!;
        // A STATUS_CHANGED event's metadata carries the step it moved to.
        const metadata = event.metadata as { newStatus?: string } | null;
        if (metadata?.newStatus && COMPLETED_STATUSES.includes(metadata.newStatus)) {
          completedTaskIds.add(event.taskId);
        } else if (metadata?.newStatus && !COMPLETED_STATUSES.includes(metadata.newStatus)) {
          // Task was un-completed (moved back from completed)
          completedTaskIds.delete(event.taskId);
        }
        eventIndex++;
      }

      // Calculate remaining points
      let completedPointsSoFar = 0;
      for (const taskId of completedTaskIds) {
        completedPointsSoFar += taskPointsMap.get(taskId) || 0;
      }

      const remaining = totalPoints - completedPointsSoFar;
      const ideal = Math.max(
        0,
        totalPoints - (totalPoints * (dayCount + 1)) / totalDays,
      );

      burndown.push({
        date: day,
        remaining: Math.max(0, remaining),
        ideal: Math.round(ideal * 100) / 100,
      });

      dayCount++;
    }

    return burndown;
  }

  /**
   * Get sprint report
   */
  async getReport(data: { id: string; organizationId: string }) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: data.id },
      include: {
        report: true,
      },
    });

    assertFoundInOrg(sprint, data.organizationId, 'Sprint');

    if (!sprint.report) {
      throw new NotFoundException('Sprint report not found. Reports are generated when a sprint is completed.');
    }

    return success(sprint.report);
  }

  /**
   * Get velocity data for the last N completed sprints
   */
  async getVelocity(data: { organizationId: string; limit?: number }) {
    // Bounded: a chart of sprints, never "every report since the beginning".
    const limit = clampListLimit(data.limit, 6);

    const reports = await this.prisma.sprintReport.findMany({
      where: { organizationId: data.organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sprint: { select: { name: true } },
      },
    });

    // Reverse so oldest is first (for chart display)
    const velocityData = reports.reverse().map((r) => ({
      sprintName: r.sprint.name,
      committedPoints: r.committedPoints,
      completedPoints: r.completedPoints,
      velocity: r.velocity,
    }));

    return success(velocityData);
  }
}
