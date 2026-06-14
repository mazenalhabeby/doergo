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
  async findAll(data: { organizationId: string; limit?: number; offset?: number }) {
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { organizationId: data.organizationId },
      orderBy: { position: 'asc' },
      take: data.limit || 100,
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
    organizationId: string;
  }) {
    // Validate DROPDOWN type has options
    if (data.type === 'DROPDOWN' && (!data.options || !Array.isArray(data.options) || data.options.length === 0)) {
      throw new BadRequestException('DROPDOWN fields must have at least one option');
    }

    // Determine position if not provided
    let position = data.position;
    if (position === undefined || position === null) {
      const lastField = await this.prisma.customFieldDefinition.findFirst({
        where: { organizationId: data.organizationId },
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

    const values = await this.prisma.customFieldValue.findMany({
      where: { taskId: data.taskId },
      include: {
        definition: true,
      },
      orderBy: { definition: { position: 'asc' } },
    });

    return success(values);
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

    // Validate values by type
    for (const val of data.values) {
      const def = definitions.find((d) => d.id === val.definitionId);
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
