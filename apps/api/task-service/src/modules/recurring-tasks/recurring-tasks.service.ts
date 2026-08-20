import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSpaceInOrg, assertWorkflowInOrg, assertUsersInOrg } from '../../common/tenant-scope.util';
import { success } from '@hbcfield/shared';

@Injectable()
export class RecurringTasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringTasksService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** How often the scheduler scans for due templates. */
  private readonly POLL_INTERVAL_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Poll for due recurring templates and auto-generate their tasks. One
    // indexed query per tick (`[nextRunAt, isActive]`), claims each template
    // atomically so multiple instances can't double-generate.
    this.pollTimer = setInterval(() => {
      this.runDue().catch((e) => this.logger.error(`Recurring scheduler error: ${e}`));
    }, this.POLL_INTERVAL_MS);
    this.logger.log('Recurring task scheduler started (every 5 min)');
    // Run once shortly after boot so a just-due template doesn't wait a full tick.
    setTimeout(() => {
      this.runDue().catch((e) => this.logger.error(`Recurring scheduler error: ${e}`));
    }, 15_000);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /**
   * List all recurring task templates for an organization
   */
  async findAll(data: { organizationId: string; limit?: number; offset?: number }) {
    const templates = await this.prisma.recurringTaskTemplate.findMany({
      where: { organizationId: data.organizationId },
      orderBy: { createdAt: 'desc' },
      take: data.limit || 100,
      skip: data.offset || 0,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        space: { select: { id: true, name: true } },
        workflow: { select: { id: true, name: true } },
      },
    });

    return success(templates);
  }

  /**
   * Create a new recurring task template
   */
  async create(data: {
    title: string;
    description?: string;
    priority?: string;
    spaceId?: string;
    workflowId?: string;
    locationLat?: number;
    locationLng?: number;
    locationAddress?: string;
    assigneeIds?: string[];
    estimatedHours?: number;
    checklist?: { text: string }[];
    frequency: string;
    customDays?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    startDate: string;
    endDate?: string;
    organizationId: string;
    createdById: string;
  }) {
    // Validate frequency-specific fields
    this.validateFrequencyFields(data.frequency, data);

    // Validate space + task type belong to this org (if provided)
    await this.assertSpaceAndWorkflow(data.organizationId, data.spaceId, data.workflowId, data.assigneeIds);

    const startDate = new Date(data.startDate);

    // Validate startDate is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    const endDate = data.endDate ? new Date(data.endDate) : null;

    if (endDate && endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Calculate the first nextRunAt
    const nextRunAt = this.calculateNextRun(
      data.frequency,
      startDate,
      null, // no lastGenerated yet
      data.dayOfWeek,
      data.dayOfMonth,
      data.customDays,
    );

    const template = await this.prisma.recurringTaskTemplate.create({
      data: {
        title: data.title,
        description: data.description,
        priority: (data.priority as any) || 'MEDIUM',
        spaceId: data.spaceId ?? null,
        workflowId: data.workflowId ?? null,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        locationAddress: data.locationAddress,
        assigneeIds: data.assigneeIds ?? undefined,
        estimatedHours: data.estimatedHours,
        checklist: data.checklist ?? undefined,
        frequency: data.frequency as any,
        customDays: data.customDays,
        dayOfWeek: data.dayOfWeek,
        dayOfMonth: data.dayOfMonth,
        startDate,
        endDate,
        nextRunAt,
        organizationId: data.organizationId,
        createdById: data.createdById,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return success(template);
  }

  /**
   * Update a recurring task template
   */
  async update(data: {
    id: string;
    organizationId: string;
    title?: string;
    description?: string;
    priority?: string;
    spaceId?: string | null;
    workflowId?: string | null;
    locationLat?: number;
    locationLng?: number;
    locationAddress?: string;
    assigneeIds?: string[];
    estimatedHours?: number;
    checklist?: { text: string }[];
    frequency?: string;
    customDays?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    endDate?: string;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Recurring task template not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Recurring task template not found');
    }

    // Validate any newly-set space / task type belong to this org
    await this.assertSpaceAndWorkflow(
      data.organizationId,
      data.spaceId === undefined ? undefined : data.spaceId ?? undefined,
      data.workflowId === undefined ? undefined : data.workflowId ?? undefined,
      data.assigneeIds,
    );

    // If frequency changed, validate and recalculate nextRunAt
    const frequency = data.frequency || existing.frequency;
    if (data.frequency) {
      this.validateFrequencyFields(data.frequency, {
        customDays: data.customDays ?? existing.customDays ?? undefined,
        dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek ?? undefined,
        dayOfMonth: data.dayOfMonth ?? existing.dayOfMonth ?? undefined,
      });
    }

    // Recalculate nextRunAt if frequency-related fields changed
    let nextRunAt = existing.nextRunAt;
    if (data.frequency || data.dayOfWeek !== undefined || data.dayOfMonth !== undefined || data.customDays !== undefined) {
      nextRunAt = this.calculateNextRun(
        frequency,
        existing.startDate,
        existing.lastGeneratedAt,
        data.dayOfWeek ?? existing.dayOfWeek ?? undefined,
        data.dayOfMonth ?? existing.dayOfMonth ?? undefined,
        data.customDays ?? existing.customDays ?? undefined,
      );
    }

    const template = await this.prisma.recurringTaskTemplate.update({
      where: { id: data.id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority as any }),
        ...(data.spaceId !== undefined && { spaceId: data.spaceId }),
        ...(data.workflowId !== undefined && { workflowId: data.workflowId }),
        ...(data.locationLat !== undefined && { locationLat: data.locationLat }),
        ...(data.locationLng !== undefined && { locationLng: data.locationLng }),
        ...(data.locationAddress !== undefined && { locationAddress: data.locationAddress }),
        ...(data.assigneeIds !== undefined && { assigneeIds: data.assigneeIds }),
        ...(data.estimatedHours !== undefined && { estimatedHours: data.estimatedHours }),
        ...(data.checklist !== undefined && { checklist: data.checklist }),
        ...(data.frequency !== undefined && { frequency: data.frequency as any }),
        ...(data.customDays !== undefined && { customDays: data.customDays }),
        ...(data.dayOfWeek !== undefined && { dayOfWeek: data.dayOfWeek }),
        ...(data.dayOfMonth !== undefined && { dayOfMonth: data.dayOfMonth }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        nextRunAt,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return success(template);
  }

  /**
   * Delete a recurring task template
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Recurring task template not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Recurring task template not found');
    }

    await this.prisma.recurringTaskTemplate.delete({ where: { id: data.id } });

    return success(null, 'Recurring task template deleted successfully');
  }

  /**
   * Manually generate a task from a recurring template
   */
  async generate(data: { id: string; organizationId: string; userId: string }) {
    const template = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id: data.id },
    });

    if (!template) {
      throw new NotFoundException('Recurring task template not found');
    }

    if (template.organizationId !== data.organizationId) {
      throw new NotFoundException('Recurring task template not found');
    }

    if (!template.isActive) {
      throw new BadRequestException('Cannot generate task from inactive template');
    }

    // Check if endDate has passed
    if (template.endDate && new Date() > template.endDate) {
      throw new BadRequestException('Template end date has passed');
    }

    // Create the task (space-, type- and flow-aware)
    const task = await this.materializeTask(template, data.userId);

    // Update template: set lastGeneratedAt and calculate next run
    const now = new Date();
    const nextRunAt = this.calculateNextRun(
      template.frequency,
      template.startDate,
      now,
      template.dayOfWeek ?? undefined,
      template.dayOfMonth ?? undefined,
      template.customDays ?? undefined,
    );

    // If nextRunAt is past endDate, keep it null (template expired)
    const finalNextRunAt = template.endDate && nextRunAt && nextRunAt > template.endDate
      ? null
      : nextRunAt;

    await this.prisma.recurringTaskTemplate.update({
      where: { id: template.id },
      data: {
        lastGeneratedAt: now,
        nextRunAt: finalNextRunAt,
      },
    });

    // Return the created task with includes
    const fullTask = await this.prisma.task.findUnique({
      where: { id: task.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignees: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });

    return success(fullTask, 'Task generated from recurring template');
  }

  /**
   * Validate frequency-specific required fields
   */
  private validateFrequencyFields(
    frequency: string,
    data: { customDays?: number; dayOfWeek?: number; dayOfMonth?: number },
  ) {
    switch (frequency) {
      case 'CUSTOM':
        if (!data.customDays || data.customDays < 1) {
          throw new BadRequestException('CUSTOM frequency requires customDays >= 1');
        }
        break;
      case 'WEEKLY':
      case 'BIWEEKLY':
        if (data.dayOfWeek === undefined || data.dayOfWeek === null) {
          throw new BadRequestException(`${frequency} frequency requires dayOfWeek (0-6)`);
        }
        break;
      case 'MONTHLY':
      case 'QUARTERLY':
        if (data.dayOfMonth === undefined || data.dayOfMonth === null) {
          throw new BadRequestException(`${frequency} frequency requires dayOfMonth (1-31)`);
        }
        break;
    }
  }

  /**
   * Calculate the next run date based on frequency
   */
  private calculateNextRun(
    frequency: string,
    startDate: Date,
    lastGenerated: Date | null,
    dayOfWeek?: number,
    dayOfMonth?: number,
    customDays?: number,
  ): Date {
    const baseDate = lastGenerated || startDate;
    const next = new Date(baseDate);

    switch (frequency) {
      case 'DAILY':
        next.setDate(next.getDate() + 1);
        break;

      case 'WEEKLY':
        next.setDate(next.getDate() + 7);
        if (dayOfWeek !== undefined) {
          // Adjust to target day of week
          const diff = dayOfWeek - next.getDay();
          next.setDate(next.getDate() + (diff >= 0 ? diff : diff + 7));
        }
        break;

      case 'BIWEEKLY':
        next.setDate(next.getDate() + 14);
        if (dayOfWeek !== undefined) {
          const diff = dayOfWeek - next.getDay();
          next.setDate(next.getDate() + (diff >= 0 ? diff : diff + 7));
        }
        break;

      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1);
        if (dayOfMonth !== undefined) {
          // Handle months with fewer days
          const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(Math.min(dayOfMonth, maxDay));
        }
        break;

      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        if (dayOfMonth !== undefined) {
          const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(Math.min(dayOfMonth, maxDay));
        }
        break;

      case 'YEARLY':
        next.setFullYear(next.getFullYear() + 1);
        break;

      case 'CUSTOM':
        if (customDays) {
          next.setDate(next.getDate() + customDays);
        }
        break;
    }

    // If the calculated next run is before now, advance to the future
    const now = new Date();
    if (next <= now) {
      return this.calculateNextRun(frequency, startDate, next, dayOfWeek, dayOfMonth, customDays);
    }

    return next;
  }

  /** Ensure a referenced space / task type belongs to the org. */
  /**
   * The ids on this template all belong to this organization.
   *
   * These three checks were written out here after a security audit; task
   * creation never adopted them and could be handed another tenant's workflow.
   * They live in tenant-scope.util now, so the rule has one statement and the
   * next path that takes an id from a client finds it rather than reinventing
   * it — slightly differently.
   */
  private async assertSpaceAndWorkflow(
    organizationId: string,
    spaceId?: string,
    workflowId?: string,
    assigneeIds?: string[],
  ) {
    await assertSpaceInOrg(this.prisma, spaceId, organizationId);
    await assertWorkflowInOrg(this.prisma, workflowId, organizationId);
    await assertUsersInOrg(this.prisma, assigneeIds, organizationId);
  }

  /** First non-cancel status of a task type (the flow's starting point). */
  private async resolveInitialStatus(workflowId: string | null): Promise<string> {
    if (!workflowId) return 'NEW';
    const first = await this.prisma.workflowStatus.findFirst({
      where: { workflowId, isCanceled: false },
      orderBy: { position: 'asc' },
      select: { key: true },
    });
    return first?.key ?? 'NEW';
  }

  /**
   * Create one real Task from a template — space-, type- and flow-aware. Shared
   * by the manual "Generate" action and the scheduler.
   */
  private async materializeTask(
    template: {
      id: string;
      title: string;
      description: string | null;
      priority: any;
      spaceId: string | null;
      workflowId: string | null;
      locationLat: number | null;
      locationLng: number | null;
      locationAddress: string | null;
      estimatedHours: number | null;
      organizationId: string;
      assigneeIds: unknown;
      checklist: unknown;
    },
    userId: string,
  ): Promise<{ id: string }> {
    const assigneeIds = Array.isArray(template.assigneeIds) ? (template.assigneeIds as string[]) : [];
    const checklist = Array.isArray(template.checklist) ? (template.checklist as { text: string }[]) : [];

    let status = await this.resolveInitialStatus(template.workflowId ?? null);
    // Legacy field-service behaviour: an assigned task with no custom type starts ASSIGNED.
    if (assigneeIds.length > 0 && !template.workflowId) status = 'ASSIGNED';

    const task = await this.prisma.task.create({
      data: {
        title: template.title,
        description: template.description,
        priority: template.priority,
        status: status as any,
        spaceId: template.spaceId ?? null,
        workflowId: template.workflowId ?? null,
        locationLat: template.locationLat,
        locationLng: template.locationLng,
        locationAddress: template.locationAddress,
        estimatedHours: template.estimatedHours,
        organizationId: template.organizationId,
        createdById: userId,
        ...(assigneeIds.length > 0 ? { assignedToId: assigneeIds[0] } : {}),
      },
    });

    if (checklist.length > 0) {
      await this.prisma.checklistItem.createMany({
        data: checklist.map((item, index) => ({ taskId: task.id, text: item.text, position: index })),
      });
    }
    if (assigneeIds.length > 0) {
      await this.prisma.taskAssignee.createMany({
        data: assigneeIds.map((uid, index) => ({
          taskId: task.id,
          userId: uid,
          role: index === 0 ? 'LEAD' : 'MEMBER',
        })),
      });
    }
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId,
        eventType: 'CREATED',
        metadata: {
          source: 'recurring_template',
          templateId: template.id,
          templateTitle: template.title,
        },
      },
    });

    return task;
  }

  /**
   * Scheduler tick: find every active template whose nextRunAt has arrived,
   * claim each atomically (compare-and-swap on nextRunAt so concurrent workers
   * don't double-generate), then create its task.
   */
  async runDue(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.recurringTaskTemplate.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      take: 200,
    });

    let generated = 0;
    for (const template of due) {
      const next = this.calculateNextRun(
        template.frequency,
        template.startDate,
        now,
        template.dayOfWeek ?? undefined,
        template.dayOfMonth ?? undefined,
        template.customDays ?? undefined,
      );
      const finalNext = template.endDate && next && next > template.endDate ? null : next;

      // Claim: only proceed if nextRunAt is still exactly what we read.
      const claim = await this.prisma.recurringTaskTemplate.updateMany({
        where: { id: template.id, nextRunAt: template.nextRunAt },
        data: { lastGeneratedAt: now, nextRunAt: finalNext },
      });
      if (claim.count !== 1) continue;

      try {
        await this.materializeTask(template, template.createdById);
        generated++;
      } catch (e) {
        this.logger.error(`Recurring generate failed for template ${template.id}: ${e}`);
      }
    }

    if (generated > 0) this.logger.log(`Recurring scheduler generated ${generated} task(s)`);
    return generated;
  }
}
