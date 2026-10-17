import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { taskActor } from '../../common/task-actor';
import { assertExternalMayWriteTask } from '../../common/external-task-write';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CreateCustomFieldDto, UpdateCustomFieldDto, SetCustomFieldValuesDto } from './dto';
import { CustomFieldsService } from './custom-fields.service';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('custom-fields')
@ApiBearerAuth()
// Custom Fields is a per-space MODULE, not an org add-on (audit T-B1). Under
// @RequirePlan, PlanGuard failed closed on a non-add-on key and 402'd every
// write for every organization — including full trials — since 2026-08-21.
@RequireModule('custom_fields') // write routes; reads pass through
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List custom field definitions (optionally scoped to a Task Type)' })
  async findAll(@Request() req: AuthedRequest, @Query('forWorkflow') forWorkflow?: string) {
    return this.customFieldsService.findAll({
      organizationId: callerOrgId(req.user),
      forWorkflow,
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a custom field definition' })
  async create(@Body() dto: CreateCustomFieldDto, @Request() req: AuthedRequest) {
    return this.customFieldsService.create({
      ...dto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a custom field definition' })
  async update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto, @Request() req: AuthedRequest) {
    return this.customFieldsService.update({
      id,
      ...dto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a custom field definition' })
  async remove(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.customFieldsService.remove({
      id,
      organizationId: callerOrgId(req.user),
    });
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@RequireModule('custom_fields') // setting task field values
@Controller('tasks')
export class TaskCustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  /**
   * The caller as the task gate needs them — the same facts every other task
   * route forwards. task-service asks its one gate (TaskAccessService); before
   * this, the values on any task in the organization were readable and
   * writable by any member who knew its id.
   */
  private taskCaller(req: AuthedRequest) {
    return taskActor(req);
  }

  @Get(':id/custom-fields')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: "Get a task's custom field values" })
  async getTaskValues(@Param('id') taskId: string, @Request() req: AuthedRequest) {
    return this.customFieldsService.getTaskValues({
      ...this.taskCaller(req),
      taskId,
    });
  }

  @Patch(':id/custom-fields')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: "Set/update a task's custom field values (batch)" })
  async setTaskValues(
    @Param('id') taskId: string,
    @Body() dto: SetCustomFieldValuesDto,
    @Request() req: AuthedRequest,
  ) {
    // An external member fills fields only on a job they raised.
    await assertExternalMayWriteTask(req, taskId, (data) => this.customFieldsService.findTask(data));
    return this.customFieldsService.setTaskValues({
      ...this.taskCaller(req),
      taskId,
      values: dto.values,
    });
  }
}
