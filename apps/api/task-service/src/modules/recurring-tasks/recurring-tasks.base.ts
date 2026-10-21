import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import {
  assertSpaceInOrg,
  assertWorkflowInOrg,
  assertUsersInOrg,
  assertCustomerInOrg,
} from '../../common/tenant-scope.util';
import type { TaskPriority } from '@prisma/client';

/**
 * What defining and running a repeat share: the frequency rules, the next run, the
 * workspace and workflow check, and making one task from a repeat.
 */
@Injectable()
export abstract class RecurringTasksBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly prisma: PrismaService) {}


  /**
   * Validate frequency-specific required fields
   */
  protected validateFrequencyFields(
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
  protected calculateNextRun(
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
  protected async assertSpaceAndWorkflow(
    organizationId: string,
    spaceId?: string,
    workflowId?: string,
    assigneeIds?: string[],
    customerId?: string,
  ) {
    await assertSpaceInOrg(this.prisma, spaceId, organizationId);
    await assertWorkflowInOrg(this.prisma, workflowId, organizationId);
    await assertUsersInOrg(this.prisma, assigneeIds, organizationId);
    // The client every generated task will carry — an id from the body says nothing about whose it is.
    await assertCustomerInOrg(this.prisma, customerId, organizationId);
  }

  /** First non-cancel status of a task type (the flow's starting point). */
  protected async resolveInitialStatus(workflowId: string | null): Promise<string> {
    if (!workflowId) return 'NEW';
    const first = await this.prisma.workflowStatus.findFirst({
      where: { workflowId, isCanceled: false },
      orderBy: { position: 'asc' },
      select: { key: true } });
    return first?.key ?? 'NEW';
  }

  /**
   * Create one real Task from a template — space-, type- and flow-aware. Shared
   * by the manual "Generate" action and the scheduler.
   */
  protected async materializeTask(
    template: {
      id: string;
      title: string;
      description: string | null;
      priority: TaskPriority;
      spaceId: string | null;
      workflowId: string | null;
      customerId: string | null;
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
        status: status,
        spaceId: template.spaceId ?? null,
        workflowId: template.workflowId ?? null,
        // The client it repeats for, onto every task it makes. Without this a
        // monthly service call produced the right address and no client.
        customerId: template.customerId ?? null,
        locationLat: template.locationLat,
        locationLng: template.locationLng,
        locationAddress: template.locationAddress,
        estimatedHours: template.estimatedHours,
        organizationId: template.organizationId,
        createdById: userId,
        ...(assigneeIds.length > 0 ? { assignedToId: assigneeIds[0] } : {}) } });

    if (checklist.length > 0) {
      await this.prisma.checklistItem.createMany({
        data: checklist.map((item, index) => ({ taskId: task.id, text: item.text, position: index })) });
    }
    if (assigneeIds.length > 0) {
      await this.prisma.taskAssignee.createMany({
        data: assigneeIds.map((uid, index) => ({
          taskId: task.id,
          userId: uid,
          role: index === 0 ? 'LEAD' : 'MEMBER' })) });
    }
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId,
        eventType: 'CREATED',
        metadata: {
          source: 'recurring_template',
          templateId: template.id,
          templateTitle: template.title } } });

    return task;
  }
}
