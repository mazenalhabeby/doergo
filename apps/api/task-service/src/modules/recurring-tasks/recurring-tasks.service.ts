import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';

@Injectable()
export class RecurringTasksService {
  private readonly logger = new Logger(RecurringTasksService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    // Create the task
    const task = await this.prisma.task.create({
      data: {
        title: template.title,
        description: template.description,
        priority: template.priority,
        status: 'NEW',
        locationLat: template.locationLat,
        locationLng: template.locationLng,
        locationAddress: template.locationAddress,
        estimatedHours: template.estimatedHours,
        organizationId: template.organizationId,
        createdById: data.userId,
      },
    });

    // Create checklist items if template has them
    const checklist = Array.isArray(template.checklist) ? template.checklist as { text: string }[] : [];
    if (checklist.length > 0) {
      await this.prisma.checklistItem.createMany({
        data: checklist.map((item, index) => ({
          taskId: task.id,
          text: item.text,
          position: index,
        })),
      });
    }

    // Create assignees if template has them
    const assigneeIds = Array.isArray(template.assigneeIds) ? template.assigneeIds as string[] : [];
    if (assigneeIds.length > 0) {
      // Set first assignee as legacy assignedToId
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          assignedToId: assigneeIds[0],
          status: 'ASSIGNED',
        },
      });

      // Create multi-assignee records
      await this.prisma.taskAssignee.createMany({
        data: assigneeIds.map((userId, index) => ({
          taskId: task.id,
          userId,
          role: index === 0 ? 'LEAD' : 'MEMBER',
        })),
      });
    }

    // Create task event
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: 'CREATED',
        metadata: {
          source: 'recurring_template',
          templateId: template.id,
          templateTitle: template.title,
        },
      },
    });

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
}
