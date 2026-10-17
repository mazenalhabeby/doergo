import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskAccessService, type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { success, assertFoundInOrg } from '@hbcfield/shared';

/** Writing a task's custom field values, each checked against its field. */
@Injectable()
export class CustomFieldValuesService {
  private readonly logger = new Logger(CustomFieldValuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
  ) {}


  /**
   * Set/update custom field values for a task (batch upsert)
   */
  async setTaskValues(data: TaskAccessFacts & {
    taskId: string;
    values: { definitionId: string; value: string }[];
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    assertFoundInOrg(task, data.organizationId, 'Task');
    // Writing needs the task itself — never the read-only role-holder exemption.
    await this.taskAccess.assert(task, data);

    // Validate all definitions exist and belong to the same org
    const definitionIds = data.values.map((v) => v.definitionId);
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: {
        id: { in: definitionIds },
        organizationId: data.organizationId } });

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
              taskId: data.taskId } },
          create: {
            definitionId: val.definitionId,
            taskId: data.taskId,
            value: val.value },
          update: {
            value: val.value },
          include: { definition: true } }),
      ),
    );

    return success(results);
  }

  /**
   * Validate a field value against its type
   */
  private validateFieldValue(type: string, value: string, options: unknown, fieldName: string) {
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
