import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskAccessService, type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { success, assertFoundInOrg } from '@hbcfield/shared';
import type { Prisma, CustomFieldType } from '@prisma/client';

@Injectable()
export class CustomFieldsService {
  private readonly logger = new Logger(CustomFieldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  /**
   * List all custom field definitions for an organization
   */
  async findAll(data: {
    organizationId: string;
    /**
     * Scope filter:
     *  - undefined        → ALL org definitions (admin/editor view, incl. inactive)
     *  - '__none__'       → active GLOBAL fields only (workflowId null)
     *  - a workflow id    → active fields applicable to that Task Type (type + global)
     */
    forWorkflow?: string;
    limit?: number;
    offset?: number;
  }) {
    let where: Prisma.CustomFieldDefinitionWhereInput = { organizationId: data.organizationId };
    if (data.forWorkflow === '__none__') {
      where = { organizationId: data.organizationId, isActive: true, workflowId: null };
    } else if (data.forWorkflow) {
      where = {
        organizationId: data.organizationId,
        isActive: true,
        OR: [{ workflowId: data.forWorkflow }, { workflowId: null }] };
    }

    const definitions = await this.prisma.customFieldDefinition.findMany({
      where,
      orderBy: { position: 'asc' },
      take: data.limit || 200,
      skip: data.offset || 0 });

    return success(definitions);
  }

  /**
   * Create a new custom field definition
   */
  async create(data: {
    name: string;
    key: string;
    type: string;
    options?: unknown;
    isRequired?: boolean;
    position?: number;
    /** Task Type this field belongs to; null/undefined → global (all tasks). */
    workflowId?: string | null;
    organizationId: string;
  }) {
    // Validate DROPDOWN type has options
    if (data.type === 'DROPDOWN' && (!data.options || !Array.isArray(data.options) || data.options.length === 0)) {
      throw new BadRequestException('DROPDOWN fields must have at least one option');
    }

    const workflowId = data.workflowId ?? null;

    // If scoped to a Task Type, make sure it belongs to this org.
    if (workflowId) {
      const wf = await this.prisma.statusWorkflow.findFirst({
        where: { id: workflowId, organizationId: data.organizationId },
        select: { id: true } });
      if (!wf) {
        throw new BadRequestException('Task Type not found in this organization');
      }
    }

    // Determine position within the same scope if not provided
    let position = data.position;
    if (position === undefined || position === null) {
      const lastField = await this.prisma.customFieldDefinition.findFirst({
        where: { organizationId: data.organizationId, workflowId },
        orderBy: { position: 'desc' },
        select: { position: true } });
      position = (lastField?.position ?? -1) + 1;
    }

    const key = data.key.toLowerCase().replace(/\s+/g, '_');

    // Friendly duplicate check (unique is [organizationId, workflowId, key]).
    // Two names that normalize to the same key collide — without this the raw
    // Prisma "Unique constraint failed" would leak into the UI.
    const dup = await this.prisma.customFieldDefinition.findFirst({
      where: { organizationId: data.organizationId, workflowId, key },
      select: { id: true } });
    if (dup) {
      throw new ConflictException(
        `A field named "${data.name}" already exists${workflowId ? ' for this task type' : ''}.`,
      );
    }

    let definition;
    try {
      definition = await this.prisma.customFieldDefinition.create({
        data: {
          name: data.name,
          key,
          type: data.type as CustomFieldType,
          // The options are stored as the request sent them (a DROPDOWN's list is checked above).
          options: data.options as Prisma.InputJsonValue,
          isRequired: data.isRequired || false,
          position,
          workflowId,
          organizationId: data.organizationId } });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `A field named "${data.name}" already exists${workflowId ? ' for this task type' : ''}.`,
        );
      }
      throw err;
    }

    return success(definition);
  }

  /**
   * Update a custom field definition
   */
  async update(data: {
    id: string;
    organizationId: string;
    name?: string;
    options?: unknown;
    isRequired?: boolean;
    position?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { id: data.id } });

    assertFoundInOrg(existing, data.organizationId, 'Custom field definition');

    const definition = await this.prisma.customFieldDefinition.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.options !== undefined && { options: data.options as Prisma.InputJsonValue }),
        ...(data.isRequired !== undefined && { isRequired: data.isRequired }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.isActive !== undefined && { isActive: data.isActive }) } });

    return success(definition);
  }

  /**
   * Delete a custom field definition (cascades to values)
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { id: data.id } });

    assertFoundInOrg(existing, data.organizationId, 'Custom field definition');

    await this.prisma.customFieldDefinition.delete({ where: { id: data.id } });

    return success(null, 'Custom field definition deleted successfully');
  }

  /**
   * Get custom field values for a task
   */
  async getTaskValues(data: TaskAccessFacts & { taskId: string }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    assertFoundInOrg(task, data.organizationId, 'Task');
    /*
      Being in the organization was the whole check, so any member could read
      the values on ANY task — including one they cannot open — by id. The same
      gate as the task page itself; a holder of the job's open role may read, as
      they may read the job.
    */
    await this.taskAccess.assert(task, data, { roleHolderMayRead: true });

    // Applicable definitions = this task's Task Type fields + global fields.
    const where = task.workflowId
      ? {
          organizationId: data.organizationId,
          isActive: true,
          OR: [{ workflowId: task.workflowId }, { workflowId: null }] }
      : { organizationId: data.organizationId, isActive: true, workflowId: null };

    const definitions = await this.prisma.customFieldDefinition.findMany({
      where,
      orderBy: { position: 'asc' } });

    const stored = await this.prisma.customFieldValue.findMany({
      where: { taskId: data.taskId } });
    const valueById = new Map(stored.map((v) => [v.definitionId, v]));

    // Return one row per applicable definition (value may be empty/unset), so
    // the client renders exactly the fields this task type should capture.
    const merged = definitions.map((def) => {
      const v = valueById.get(def.id);
      return {
        id: v?.id ?? `unset-${def.id}`,
        definitionId: def.id,
        taskId: data.taskId,
        value: v?.value ?? '',
        definition: def };
    });

    return success(merged);
  }
}
