import { Injectable, BadRequestException } from '@nestjs/common';
import { workspaceZone } from '../../common/zone.util';
import { success, localPartsIn, assertFoundInOrg, PrismaService, zonedWallTimeToUtc } from '@hbcfield/shared';
import { firstRunAt, nextRunPast, validateFrequencyFields, withinEnd, type RepeatRule } from './recurring-schedule';
import { assertTemplateRefsInOrg } from './recurring-materialize';
// Requests are the message contracts' (shared with the gateway) — one definition, not two.
import { type createRecurringTask, type updateRecurringTask, type RpcRequest } from '@hbcfield/shared/microservices';
import type { RecurrenceFrequency, TaskPriority } from '@prisma/client';

@Injectable()
export class RecurringTasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all recurring task templates for an organization
   */
  async findAll(data: { organizationId: string; limit?: number; offset?: number; scopeSpaceIds?: string[] }) {
    const templates = await this.prisma.recurringTaskTemplate.findMany({
      where: {
        organizationId: data.organizationId,
        /*
          A space-granted caller sees the templates for their own spaces. In the
          query on the indexed `spaceId`, not filtered afterwards.

          undefined adds nothing (org-wide). `[]` — granted nowhere — becomes
          `in: []`, which matches nothing, and that is the intended answer.
        */
        ...(data.scopeSpaceIds === undefined ? {} : { spaceId: { in: data.scopeSpaceIds } }),
      },
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
  async create(data: RpcRequest<typeof createRecurringTask>) {
    // Validate frequency-specific fields
    validateFrequencyFields(data.frequency, data);

    // Validate space + task type + client belong to this org (if provided)
    await assertTemplateRefsInOrg(
      this.prisma,
      data.organizationId,
      data.spaceId,
      data.workflowId,
      data.assigneeIds,
      data.customerId,
    );

    let startDate = new Date(data.startDate);

    /*
      Validate startDate is not in the past — as CALENDAR DAYS in the
      workspace's zone, never the server's. In UTC an organization in New York
      was told at 22:00 that today's date "is in the past". A bare date is a day
      as typed; a full timestamp is read as its local day there.
    */
    const zone = await workspaceZone(this.prisma, data);
    const bareDay = /^\d{4}-\d{2}-\d{2}$/.test(data.startDate);
    const startDay = bareDay ? data.startDate : localPartsIn(startDate, zone).dateStr;
    // A bare day is that day's start WHERE THE WORK IS — never UTC midnight (the evening before in New York).
    if (bareDay) startDate = zonedWallTimeToUtc(startDay, 0, 0, zone);
    if (startDay < localPartsIn(new Date(), zone).dateStr) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    const endDate = data.endDate ? new Date(data.endDate) : null;

    if (endDate && endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // The start day itself makes the first job (or the first day after it the rule names).
    const nextRunAt = withinEnd(firstRunAt(ruleOf(data), startDate, zone), endDate);

    const template = await this.prisma.recurringTaskTemplate.create({
      data: {
        title: data.title,
        description: data.description,
        priority: (data.priority as TaskPriority) || 'MEDIUM',
        spaceId: data.spaceId ?? null,
        workflowId: data.workflowId ?? null,
        customerId: data.customerId ?? null,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        locationAddress: data.locationAddress,
        assigneeIds: data.assigneeIds ?? undefined,
        estimatedHours: data.estimatedHours,
        checklist: data.checklist ?? undefined,
        frequency: data.frequency as RecurrenceFrequency,
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
  async update(data: RpcRequest<typeof updateRecurringTask>) {
    const existing = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id: data.id },
    });

    assertFoundInOrg(existing, data.organizationId, 'Recurring task template');

    // Validate any newly-set space / task type belong to this org
    await assertTemplateRefsInOrg(
      this.prisma,
      data.organizationId,
      data.spaceId === undefined ? undefined : (data.spaceId ?? undefined),
      data.workflowId === undefined ? undefined : (data.workflowId ?? undefined),
      data.assigneeIds,
      data.customerId ?? undefined,
    );

    // If frequency changed, validate and recalculate nextRunAt
    const frequency = data.frequency || existing.frequency;
    if (data.frequency) {
      validateFrequencyFields(data.frequency, {
        customDays: data.customDays ?? existing.customDays ?? undefined,
        dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek ?? undefined,
        dayOfMonth: data.dayOfMonth ?? existing.dayOfMonth ?? undefined,
      });
    }

    // Recalculate nextRunAt if frequency-related fields changed: the new rule's first run that is not
    // already made (before the old next run), in the workspace's zone — never counted from "now".
    let nextRunAt = existing.nextRunAt;
    if (
      data.frequency ||
      data.dayOfWeek !== undefined ||
      data.dayOfMonth !== undefined ||
      data.customDays !== undefined
    ) {
      const rule = ruleOf({
        frequency,
        dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek,
        dayOfMonth: data.dayOfMonth ?? existing.dayOfMonth,
        customDays: data.customDays ?? existing.customDays,
      });
      const where = {
        spaceId: data.spaceId === undefined ? existing.spaceId : data.spaceId,
        organizationId: data.organizationId,
      };
      const zone = await workspaceZone(this.prisma, where);
      const first = firstRunAt(rule, existing.startDate, zone);
      const used = existing.nextRunAt ? new Date(existing.nextRunAt.getTime() - 1) : existing.lastGeneratedAt;
      const endDate = data.endDate === undefined ? existing.endDate : data.endDate ? new Date(data.endDate) : null;
      nextRunAt = withinEnd(used ? nextRunPast(rule, first, used, zone) : first, endDate);
    }

    const template = await this.prisma.recurringTaskTemplate.update({
      where: { id: data.id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority as TaskPriority }),
        ...(data.spaceId !== undefined && { spaceId: data.spaceId }),
        ...(data.workflowId !== undefined && { workflowId: data.workflowId }),
        ...(data.customerId !== undefined && { customerId: data.customerId }),
        ...(data.locationLat !== undefined && { locationLat: data.locationLat }),
        ...(data.locationLng !== undefined && { locationLng: data.locationLng }),
        ...(data.locationAddress !== undefined && { locationAddress: data.locationAddress }),
        ...(data.assigneeIds !== undefined && { assigneeIds: data.assigneeIds }),
        ...(data.estimatedHours !== undefined && { estimatedHours: data.estimatedHours }),
        ...(data.checklist !== undefined && { checklist: data.checklist }),
        ...(data.frequency !== undefined && { frequency: data.frequency as RecurrenceFrequency }),
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

    assertFoundInOrg(existing, data.organizationId, 'Recurring task template');

    await this.prisma.recurringTaskTemplate.delete({ where: { id: data.id } });

    return success(null, 'Recurring task template deleted successfully');
  }
}

/** The schedule fields of a request or a template, as the schedule reads them. */
function ruleOf(r: {
  frequency: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  customDays?: number | null;
}): RepeatRule {
  return { frequency: r.frequency, dayOfWeek: r.dayOfWeek, dayOfMonth: r.dayOfMonth, customDays: r.customDays };
}
