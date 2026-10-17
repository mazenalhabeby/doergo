import { Controller, Get, Post, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { taskActor, assignSpaceIds, grantedSpaceIds } from '../../common/task-actor';
import {
  CreateTaskDto,
  AddChecklistItemDto,
  UpdateChecklistItemDto,
  ReorderChecklistDto,
  CreateDependencyDto,
} from './dto';
import { TasksControllerBase } from './tasks-controller.base';

import type { AuthedRequest } from '../../common/request.types';
/** /tasks/:id — checklist items, subtasks and dependencies. */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskChecklistController extends TasksControllerBase {
  // ============ Checklist Endpoints ============

  /*
     ⚠️ No module gate existed on any of these. A workspace that had not
     switched checklists on could still use them.

     A checklist lives on a task but is written through its own routes, so it can
     be refused without refusing the task.

     ⚠️ @DenyExternal on every write: the checklist now records WHO did the work
     (shared tasks/checklist.ts). An external supervisor or observer watches the
     work; ticking it would put a client's name on our record of who did it.
  */
  @RequireModule('checklists')
  @Post(':id/checklist')
  @DenyExternal()
  @ApiOperation({ summary: 'Add a checklist item to a task' })
  async addChecklistItem(
    @Param('id') id: string,
    @Body() addChecklistItemDto: AddChecklistItemDto,
    @Request() req: AuthedRequest,
  ) {
    return this.tasksQueueService.addChecklistItem({
      taskId: id,
      ...addChecklistItemDto,
      ...taskActor(req),
    });
  }

  @RequireModule('checklists')
  @Patch(':id/checklist/reorder')
  @DenyExternal()
  @ApiOperation({ summary: 'Reorder checklist items' })
  async reorderChecklist(
    @Param('id') id: string,
    @Body() reorderChecklistDto: ReorderChecklistDto,
    @Request() req: AuthedRequest,
  ) {
    return this.tasksQueueService.reorderChecklist({
      taskId: id,
      ...reorderChecklistDto,
      ...taskActor(req),
    });
  }

  @RequireModule('checklists')
  @Patch(':id/checklist/:itemId')
  @DenyExternal()
  @ApiOperation({ summary: 'Update a checklist item (text or toggle completion)' })
  async updateChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() updateChecklistItemDto: UpdateChecklistItemDto,
    @Request() req: AuthedRequest,
  ) {
    return this.tasksQueueService.updateChecklistItem({
      taskId: id,
      itemId,
      ...updateChecklistItemDto,
      ...taskActor(req),
    });
  }

  @RequireModule('checklists')
  @Delete(':id/checklist/:itemId')
  @DenyExternal()
  @ApiOperation({ summary: 'Delete a checklist item' })
  async deleteChecklistItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req: AuthedRequest) {
    return this.tasksQueueService.deleteChecklistItem({
      taskId: id,
      itemId,
      ...taskActor(req),
    });
  }

  // ============ Subtask Endpoints ============

  /*
     ⚠️ No module gate existed on any of these. A workspace that had not
     switched subtasks on could still use them.

     This route is ENTIRELY a subtask, so refusing it whole is right — nothing
     else is lost with it.
  */
  @RequireModule('subtasks')
  @Post(':id/subtasks')
  /*
    Space-aware, like the create route above it.

    This asked the flat ORG column, so a supervisor who runs a site — granted
    "create tasks" by their space role — could open a job at that site and be
    refused when breaking it into steps. The button was there and the action
    was not, which reads as a broken app rather than a permission.

    Widening the guard moves the real decision into the service, where the
    PARENT task's own space is known: the route takes a task id straight from
    the caller, so without that check a member granted in one space could hang
    a subtask off any task in the organization.
  */
  @RequirePermissionInSpace('canCreateTasks')
  @ApiOperation({ summary: 'Create a subtask under a task' })
  async createSubtask(@Param('id') id: string, @Body() createTaskDto: CreateTaskDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.createSubtask({
      ...createTaskDto,
      parentId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canCreateTasks: req.user.canCreateTasks,
      createSpaceIds: grantedSpaceIds(req, 'canCreateTasks'),
      /*
        A subtask may name its assignee, and assigning is its own right —
        org-wide, or in the parent's space (task-service decides on the real
        space). Without these a non-admin who named one was refused outright.
      */
      canAssignTasks: req.user.canAssignTasks,
      assignSpaceIds: assignSpaceIds(req),
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/subtasks')
  @ApiOperation({ summary: 'Get subtasks of a task' })
  async getSubtasks(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.tasksService.getSubtasks({
      taskId: id,
      ...taskActor(req),
    });
  }

  // ============ Dependency Endpoints ============

  @Post(':id/dependencies')
  // Space-aware for the same reason as subtasks: ordering the work is part of
  // running the site, and the service checks the successor task's real space.
  @RequirePermissionInSpace('canCreateTasks')
  // Dependencies is a per-space MODULE, not an org add-on. It was @RequirePlan
  // under the retired tier model; PlanGuard fails closed on a key that is not an
  // add-on, so every organization got a 402 here from the 2026-08-21 pricing
  // migration onward (audit T-B1).
  @RequireModule('dependencies')
  @ApiOperation({ summary: 'Add a dependency to a task (this task becomes the successor)' })
  async addDependency(
    @Param('id') id: string,
    @Body() createDependencyDto: CreateDependencyDto,
    @Request() req: AuthedRequest,
  ) {
    return this.tasksQueueService.addDependency({
      ...createDependencyDto,
      successorId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canCreateTasks: req.user.canCreateTasks,
      createSpaceIds: grantedSpaceIds(req, 'canCreateTasks'),
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/dependencies/:depId')
  @RequirePermissionInSpace('canCreateTasks')
  // Dependencies is a per-space MODULE, not an org add-on. It was @RequirePlan
  // under the retired tier model; PlanGuard fails closed on a key that is not an
  // add-on, so every organization got a 402 here from the 2026-08-21 pricing
  // migration onward (audit T-B1).
  @RequireModule('dependencies')
  @ApiOperation({ summary: 'Remove a dependency from a task' })
  async removeDependency(@Param('id') _id: string, @Param('depId') depId: string, @Request() req: AuthedRequest) {
    return this.tasksQueueService.removeDependency({
      dependencyId: depId,
      userId: req.user.id,
      userRole: req.user.role,
      canCreateTasks: req.user.canCreateTasks,
      createSpaceIds: grantedSpaceIds(req, 'canCreateTasks'),
      organizationId: req.user.organizationId,
    });
  }
}
