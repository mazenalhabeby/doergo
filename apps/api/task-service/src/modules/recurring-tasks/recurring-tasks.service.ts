import { Injectable, BadRequestException } from '@nestjs/common';
import { workspaceZone } from '../../common/zone.util';
import { success, localPartsIn, assertFoundInOrg } from '@hbcfield/shared';
import { RecurringTasksBase } from './recurring-tasks.base';

@Injectable()
export class RecurringTasksService extends RecurringTasksBase {

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
        ...(data.scopeSpaceIds === undefined ? {} : { spaceId: { in: data.scopeSpaceIds } }) },
      orderBy: { createdAt: 'desc' },
      take: data.limit || 100,
      skip: data.offset || 0,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        space: { select: { id: true, name: true } },
        workflow: { select: { id: true, name: true } } } });

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
    customerId?: string;
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

    // Validate space + task type + client belong to this org (if provided)
    await this.assertSpaceAndWorkflow(data.organizationId, data.spaceId, data.workflowId, data.assigneeIds, data.customerId);

    const startDate = new Date(data.startDate);

    /*
      Validate startDate is not in the past — as CALENDAR DAYS in the
      workspace's zone, never the server's. In UTC an organization in New York
      was told at 22:00 that today's date "is in the past". A bare date is a day
      as typed; a full timestamp is read as its local day there.
    */
    const zone = await workspaceZone(this.prisma, data);
    const startDay = /^\d{4}-\d{2}-\d{2}$/.test(data.startDate) ? data.startDate : localPartsIn(startDate, zone).dateStr;
    if (startDay < localPartsIn(new Date(), zone).dateStr) {
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
        customerId: data.customerId ?? null,
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
        createdById: data.createdById },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } } } });

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
    customerId?: string | null;
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
      where: { id: data.id } });

    assertFoundInOrg(existing, data.organizationId, 'Recurring task template');

    // Validate any newly-set space / task type belong to this org
    await this.assertSpaceAndWorkflow(
      data.organizationId,
      data.spaceId === undefined ? undefined : data.spaceId ?? undefined,
      data.workflowId === undefined ? undefined : data.workflowId ?? undefined,
      data.assigneeIds,
      data.customerId ?? undefined,
    );

    // If frequency changed, validate and recalculate nextRunAt
    const frequency = data.frequency || existing.frequency;
    if (data.frequency) {
      this.validateFrequencyFields(data.frequency, {
        customDays: data.customDays ?? existing.customDays ?? undefined,
        dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek ?? undefined,
        dayOfMonth: data.dayOfMonth ?? existing.dayOfMonth ?? undefined });
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
        ...(data.customerId !== undefined && { customerId: data.customerId }),
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
        nextRunAt },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } } } });

    return success(template);
  }

  /**
   * Delete a recurring task template
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id: data.id } });

    assertFoundInOrg(existing, data.organizationId, 'Recurring task template');

    await this.prisma.recurringTaskTemplate.delete({ where: { id: data.id } });

    return success(null, 'Recurring task template deleted successfully');
  }
}
