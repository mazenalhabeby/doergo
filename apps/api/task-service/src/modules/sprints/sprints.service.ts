import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import { success, assertFoundInOrg } from '@hbcfield/shared';
import { workspaceZone } from '../../common/zone.util';
import { SprintReportsService } from './sprint-reports.service';

@Injectable()
export class SprintsService {

  @Inject(SprintReportsService) private readonly sprintReports!: SprintReportsService;

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

    assertFoundInOrg(sprint, data.organizationId, 'Sprint');

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
    // The space id comes from the body: it must be this organization's, and live (tenant-scope.util).
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { activeOnly: true });

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

    assertFoundInOrg(existing, data.organizationId, 'Sprint');

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

    assertFoundInOrg(existing, data.organizationId, 'Sprint');

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

    assertFoundInOrg(existing, data.organizationId, 'Sprint');

    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE sprints can be completed');
    }

    // The burndown's days are the sprint's WORKSPACE's days, never the server's (zone.util).
    const timezone = await workspaceZone(this.prisma, { spaceId: existing.spaceId, organizationId: existing.organizationId });

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
      const report = await this.sprintReports.generateSprintReport(tx, sprint, { ...existing, timezone });

      return { sprint: { ...sprint, tasks: undefined, report }, report };
    });

    return success(result.sprint);
  }

  /**
   * Delete a sprint (unlinks tasks, does not delete them)
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.sprint.findUnique({
      where: { id: data.id },
    });

    assertFoundInOrg(existing, data.organizationId, 'Sprint');

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
