import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';

@Injectable()
export class SprintsService {
  private readonly logger = new Logger(SprintsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all sprints for an organization
   */
  async findAll(data: { organizationId: string; status?: string; spaceId?: string; limit?: number; offset?: number }) {
    const where: any = { organizationId: data.organizationId };
    /*
      A space sees its own planning objects plus the organization-wide ones.

      Null spaceId means organization-wide — every row created before spaces
      owned these is one, and an organization running a single backlog across
      its sites keeps working. Without the null arm, this change would have
      emptied every existing board.
    */
    if (data.spaceId) where.OR = [{ spaceId: data.spaceId }, { spaceId: null }];
    if (data.status) {
      where.status = data.status;
    }

    const sprints = await this.prisma.sprint.findMany({
      where,
      orderBy: { position: 'asc' },
      take: data.limit || 100,
      skip: data.offset || 0,
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(sprints);
  }

  /**
   * Get a single sprint with its tasks
   */
  async findOne(data: { id: string; organizationId: string }) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: data.id },
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
    });

    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    if (sprint.organizationId !== data.organizationId) {
      throw new NotFoundException('Sprint not found');
    }

    return success(sprint);
  }

  /**
   * Create a new sprint
   */
  async create(data: {
    name: string;
    /** Created inside a space → it belongs there. Omitted → organization-wide. */
    spaceId?: string | null;
    goal?: string;
    startDate: string;
    endDate: string;
    position?: number;
    organizationId: string;
  }) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Determine position if not provided
    let position = data.position;
    if (position === undefined || position === null) {
      const lastSprint = await this.prisma.sprint.findFirst({
        where: { organizationId: data.organizationId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (lastSprint?.position ?? -1) + 1;
    }

    const sprint = await this.prisma.sprint.create({
      data: {
        spaceId: data.spaceId ?? null,
        name: data.name,
        goal: data.goal,
        startDate,
        endDate,
        position,
        organizationId: data.organizationId,
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(sprint);
  }

  /**
   * Update a sprint
   */
  async update(data: {
    id: string;
    organizationId: string;
    name?: string;
    goal?: string;
    startDate?: string;
    endDate?: string;
    position?: number;
  }) {
    const existing = await this.prisma.sprint.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Sprint not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Sprint not found');
    }

    // Validate dates if provided
    const startDate = data.startDate ? new Date(data.startDate) : existing.startDate;
    const endDate = data.endDate ? new Date(data.endDate) : existing.endDate;

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const sprint = await this.prisma.sprint.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.goal !== undefined && { goal: data.goal }),
        ...(data.startDate !== undefined && { startDate }),
        ...(data.endDate !== undefined && { endDate }),
        ...(data.position !== undefined && { position: data.position }),
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(sprint);
  }

  /**
   * Start a sprint (change status to ACTIVE)
   * Only ONE sprint can be ACTIVE per organization at a time
   */
  async start(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.sprint.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Sprint not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Sprint not found');
    }

    if (existing.status !== 'PLANNING') {
      throw new BadRequestException('Only sprints in PLANNING status can be started');
    }

    // Check for existing active sprint
    const activeSprint = await this.prisma.sprint.findFirst({
      where: {
        organizationId: data.organizationId,
        status: 'ACTIVE',
      },
    });

    if (activeSprint) {
      throw new BadRequestException(
        `Sprint "${activeSprint.name}" is already active. Complete it before starting another.`,
      );
    }

    const sprint = await this.prisma.sprint.update({
      where: { id: data.id },
      data: { status: 'ACTIVE' },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(sprint);
  }

  /**
   * Complete a sprint (change status to COMPLETED) and auto-generate a SprintReport.
   */
  async complete(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.sprint.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Sprint not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Sprint not found');
    }

    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE sprints can be completed');
    }

    // Run sprint completion and report generation in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Complete the sprint
      const sprint = await tx.sprint.update({
        where: { id: data.id },
        data: { status: 'COMPLETED' },
        include: {
          tasks: {
            select: {
              id: true,
              status: true,
              storyPoints: true,
              createdAt: true,
            },
          },
          _count: { select: { tasks: true } },
        },
      });

      // Generate sprint report
      const report = await this.generateSprintReport(tx, sprint, existing);

      return { sprint: { ...sprint, tasks: undefined, report }, report };
    });

    return success(result.sprint);
  }

  /**
   * Generate a sprint report with burndown data, committed/completed stats
   */
  private async generateSprintReport(
    tx: any,
    sprint: any,
    sprintMeta: { id: string; organizationId: string; startDate: Date; endDate: Date },
  ) {
    const tasks = sprint.tasks || [];

    // Completed statuses (final states)
    const COMPLETED_STATUSES = ['COMPLETED', 'CLOSED'];
    const CANCELED_STATUSES = ['CANCELED'];

    // Count committed tasks (those that were in the sprint)
    const committedTasks = tasks.length;
    const committedPoints = tasks.reduce(
      (sum: number, t: any) => sum + (t.storyPoints || 0),
      0,
    );

    // Count completed tasks
    const completedTasksList = tasks.filter((t: any) =>
      COMPLETED_STATUSES.includes(t.status),
    );
    const completedTasks = completedTasksList.length;
    const completedPoints = completedTasksList.reduce(
      (sum: number, t: any) => sum + (t.storyPoints || 0),
      0,
    );

    // Count carried over (not completed and not canceled)
    const carriedOverList = tasks.filter(
      (t: any) =>
        !COMPLETED_STATUSES.includes(t.status) &&
        !CANCELED_STATUSES.includes(t.status),
    );
    const carriedOverTasks = carriedOverList.length;
    const carriedOverPoints = carriedOverList.reduce(
      (sum: number, t: any) => sum + (t.storyPoints || 0),
      0,
    );

    // Count tasks added mid-sprint (created after sprint start)
    const addedMidSprint = tasks.filter(
      (t: any) => new Date(t.createdAt) > sprintMeta.startDate,
    ).length;

    // Build daily burndown from task status change events
    const dailyBurndown = await this.buildDailyBurndown(
      tx,
      tasks,
      sprintMeta.startDate,
      sprintMeta.endDate,
      committedPoints,
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
    tx: any,
    tasks: any[],
    startDate: Date,
    endDate: Date,
    totalPoints: number,
  ): Promise<{ date: string; remaining: number; ideal: number }[]> {
    const taskIds = tasks.map((t: any) => t.id);

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

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Calculate total sprint days for ideal line
    const totalDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    );

    // Track which tasks are completed by each day
    const completedTaskIds = new Set<string>();
    let eventIndex = 0;

    const current = new Date(start);
    let dayCount = 0;

    while (current <= end) {
      const dayEnd = new Date(current);
      dayEnd.setHours(23, 59, 59, 999);

      // Process events up to this day
      while (
        eventIndex < statusEvents.length &&
        new Date(statusEvents[eventIndex]!.createdAt) <= dayEnd
      ) {
        const event = statusEvents[eventIndex]!;
        const metadata = event.metadata as any;
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
        date: current.toISOString().split('T')[0]!,
        remaining: Math.max(0, remaining),
        ideal: Math.round(ideal * 100) / 100,
      });

      current.setDate(current.getDate() + 1);
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

    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    if (sprint.organizationId !== data.organizationId) {
      throw new NotFoundException('Sprint not found');
    }

    if (!sprint.report) {
      throw new NotFoundException('Sprint report not found. Reports are generated when a sprint is completed.');
    }

    return success(sprint.report);
  }

  /**
   * Get velocity data for the last N completed sprints
   */
  async getVelocity(data: { organizationId: string; limit?: number }) {
    const limit = data.limit || 6;

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

  /**
   * Delete a sprint (unlinks tasks, does not delete them)
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.sprint.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Sprint not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Sprint not found');
    }

    if (existing.status === 'ACTIVE') {
      throw new BadRequestException('Cannot delete an active sprint. Complete it first.');
    }

    // Unlink tasks from this sprint before deleting
    await this.prisma.task.updateMany({
      where: { sprintId: data.id },
      data: { sprintId: null },
    });

    await this.prisma.sprint.delete({ where: { id: data.id } });

    return success(null, 'Sprint deleted successfully');
  }
}
