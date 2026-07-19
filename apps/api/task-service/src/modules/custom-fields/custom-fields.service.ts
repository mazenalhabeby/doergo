import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';

@Injectable()
export class CustomFieldsService {
  private readonly logger = new Logger(CustomFieldsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    let where: any = { organizationId: data.organizationId };
    if (data.forWorkflow === '__none__') {
      where = { organizationId: data.organizationId, isActive: true, workflowId: null };
    } else if (data.forWorkflow) {
      where = {
        organizationId: data.organizationId,
        isActive: true,
        OR: [{ workflowId: data.forWorkflow }, { workflowId: null }],
      };
    }

    const definitions = await this.prisma.customFieldDefinition.findMany({
      where,
      orderBy: { position: 'asc' },
      take: data.limit || 200,
      skip: data.offset || 0,
    });

    return success(definitions);
  }

  /**
   * Create a new custom field definition
   */
  async create(data: {
    name: string;
    key: string;
    type: string;
    options?: any;
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
        select: { id: true },
      });
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
        select: { position: true },
      });
      position = (lastField?.position ?? -1) + 1;
    }

    const definition = await this.prisma.customFieldDefinition.create({
      data: {
        name: data.name,
        key: data.key.toLowerCase().replace(/\s+/g, '_'),
        type: data.type as any,
        options: data.options,
        isRequired: data.isRequired || false,
        position,
        workflowId,
        organizationId: data.organizationId,
      },
    });

    return success(definition);
  }

  /**
   * Update a custom field definition
   */
  async update(data: {
    id: string;
    organizationId: string;
    name?: string;
    options?: any;
    isRequired?: boolean;
    position?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Custom field definition not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Custom field definition not found');
    }

    const definition = await this.prisma.customFieldDefinition.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.options !== undefined && { options: data.options }),
        ...(data.isRequired !== undefined && { isRequired: data.isRequired }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return success(definition);
  }

  /**
   * Delete a custom field definition (cascades to values)
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Custom field definition not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Custom field definition not found');
    }

    await this.prisma.customFieldDefinition.delete({ where: { id: data.id } });

    return success(null, 'Custom field definition deleted successfully');
  }

  /**
   * Get custom field values for a task
   */
  async getTaskValues(data: { taskId: string; organizationId: string }) {
    // Verify task belongs to org + read its Task Type
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
      select: { organizationId: true, workflowId: true },
    });

    if (!task || task.organizationId !== data.organizationId) {
      throw new NotFoundException('Task not found');
    }

    // Applicable definitions = this task's Task Type fields + global fields.
    const where = task.workflowId
      ? {
          organizationId: data.organizationId,
          isActive: true,
          OR: [{ workflowId: task.workflowId }, { workflowId: null }],
        }
      : { organizationId: data.organizationId, isActive: true, workflowId: null };

    const definitions = await this.prisma.customFieldDefinition.findMany({
      where,
      orderBy: { position: 'asc' },
    });

    const stored = await this.prisma.customFieldValue.findMany({
      where: { taskId: data.taskId },
    });
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
        definition: def,
      };
    });

    return success(merged);
  }

  /**
   * Set/update custom field values for a task (batch upsert)
   */
  async setTaskValues(data: {
    taskId: string;
    organizationId: string;
    values: { definitionId: string; value: string }[];
  }) {
    // Verify task belongs to org
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
      select: { organizationId: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.organizationId !== data.organizationId) {
      throw new NotFoundException('Task not found');
    }

    // Validate all definitions exist and belong to the same org
    const definitionIds = data.values.map((v) => v.definitionId);
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: {
        id: { in: definitionIds },
        organizationId: data.organizationId,
      },
    });

    if (definitions.length !== definitionIds.length) {
      throw new BadRequestException('One or more custom field definitions not found in this organization');
    }

    // Validate values by type (O(1) definition lookup via Map)
    const defById = new Map(definitions.map((d) => [d.id, d]));
    for (const val of data.values) {
      const def = defById.get(val.definitionId);
      if (!def) continue;

      this.validateFieldValue(def.type, val.value, def.options, def.name);
    }

    // Batch upsert
    const results = await this.prisma.$transaction(
      data.values.map((val) =>
        this.prisma.customFieldValue.upsert({
          where: {
            definitionId_taskId: {
              definitionId: val.definitionId,
              taskId: data.taskId,
            },
          },
          create: {
            definitionId: val.definitionId,
            taskId: data.taskId,
            value: val.value,
          },
          update: {
            value: val.value,
          },
          include: { definition: true },
        }),
      ),
    );

    return success(results);
  }

  /**
   * Validate a field value against its type
   */
  private validateFieldValue(type: string, value: string, options: any, fieldName: string) {
    switch (type) {
      case 'NUMBER':
        if (isNaN(Number(value))) {
          throw new BadRequestException(`Field "${fieldName}" expects a number`);
        }
        break;
      case 'DATE':
        if (isNaN(Date.parse(value))) {
          throw new BadRequestException(`Field "${fieldName}" expects a valid date`);
        }
        break;
      case 'CHECKBOX':
        if (value !== 'true' && value !== 'false') {
          throw new BadRequestException(`Field "${fieldName}" expects "true" or "false"`);
        }
        break;
      case 'DROPDOWN':
        if (Array.isArray(options) && !options.includes(value)) {
          throw new BadRequestException(
            `Field "${fieldName}" value must be one of: ${(options as string[]).join(', ')}`,
          );
        }
        break;
      case 'EMAIL':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new BadRequestException(`Field "${fieldName}" expects a valid email`);
        }
        break;
      case 'URL':
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error();
          }
        } catch {
          throw new BadRequestException(`Field "${fieldName}" expects a valid URL`);
        }
        break;
      // TEXT: no validation needed
    }
  }
}
