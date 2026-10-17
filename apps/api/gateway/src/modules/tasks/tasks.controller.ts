import { scopeFor } from '../../common/permission-scope';
import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role, isAdmin, accessAllowsAnywhere } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { taskActor, assignSpaceIds, grantedSpaceIds } from '../../common/task-actor';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto, UpdateStatusDto, SetOpenRoleDto, ReturnToRoleDto } from './dto';
import { TasksControllerBase } from './tasks-controller.base';

export { normalizeQueryParams } from './tasks-controller-helpers';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController extends TasksControllerBase {
  @Post()
  @RequirePermissionInSpace('canCreateTasks')
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto, @Request() req: any) {
    this.assertTaskFieldEntitlements(req.user, createTaskDto);

    // Creating into a cross-org space shared with the caller: the caller's OWN-org
    // taskCreationScope (NONE/SELF/SPACE) doesn't apply — the per-space grant
    // governs, and the task-service authorizes against the real space + the
    // forwarded access. Detect it (server-authoritative) and skip own-org scoping.
    const targetSpaceId = (createTaskDto as any).spaceId;
    const isForeignShared =
      !!targetSpaceId && (req.user.access?.sharedSpaces ?? []).some((s: any) => s.spaceId === targetSpaceId);

    if (!isForeignShared) {
      const scope = req.user.taskCreationScope || 'NONE';
      // NONE scope cannot create tasks (guard should catch, but double-check)
      if (scope === 'NONE') {
        throw new ForbiddenException('You do not have permission to create tasks.');
      }
      // SELF scope: force assignedToId to the current user
      if (scope === 'SELF') {
        createTaskDto.assignedToId = req.user.id;
      }
      // SPACE scope: assignee validation handled by task-service (space membership)
      // ORG scope: no restrictions on assignee
    }

    /*
      Creating is not assigning.

      An External Observer — a client's representative who follows the work —
      may raise a job and nothing else. `canCreateTasks` and `canAssignTasks`
      are separate permissions and always were; this is the one place they were
      allowed to blur, because the create route accepts an assignee.

      Stripped rather than refused: the task they meant to raise is still
      raised, unassigned, which is what happens to any job nobody has picked up
      yet. Refusing the whole request would turn "you may not choose who does
      this" into "you may not report the fault", which is the opposite of the
      point.

      Server-side and unconditional — the picker is hidden for them too, but a
      hidden control is a courtesy, not a boundary. Admins and holders of
      `canAssignTasks` (org-wide OR in the target space) are unaffected.
    */
    if (
      createTaskDto.assignedToId &&
      !isAdmin(req.user) &&
      req.user.canAssignTasks !== true &&
      !accessAllowsAnywhere(req.user?.access, 'canAssignTasks')
    ) {
      createTaskDto.assignedToId = undefined;
    }

    /*
      Opening a job to a role IS assigning (to whoever takes it), so it asks the
      same right: org-wide, or in the task's own workspace. Stripped like the
      assignee above, never refused — the job is still raised.
    */
    /*
      ⚠️ No workspace named = the task-service files it in the organization's
      default workspace, which only it knows. So for a caller who may assign
      only in SOME workspaces, the spaces are forwarded and the decision is made
      there, on the FINAL workspace — stripping here would drop the role for
      every such person who left the workspace blank.
    */
    let roleAssignSpaceIds: string[] | undefined;
    if (createTaskDto.openRoleId && !isAdmin(req.user) && req.user.canAssignTasks !== true) {
      const granted = scopeFor(req.user, 'canAssignTasks') ?? [];
      if (targetSpaceId && !granted.includes(targetSpaceId)) {
        createTaskDto.openRoleId = undefined;
        createTaskDto.openSpots = undefined;
      } else if (!targetSpaceId) {
        roleAssignSpaceIds = granted;
      }
    }

    return this.tasksQueueService.createTask({
      ...createTaskDto,
      ...(roleAssignSpaceIds ? { roleAssignSpaceIds } : {}),
      userId: req.user.id,
      organizationId: req.user.organizationId,
      access: req.user.access, // server-authoritative; task-service enforces the real space
      /*
        The member's task-creation scope (NONE | SELF | SPACE | ORG), resolved
        from their column and grants in validateToken. task-service has always
        checked SPACE ("pick a workspace you are on") — and nothing ever sent
        it, so the check was dead. After the spread, so a body field can never
        set it. An administrator is never narrowed by a column.
      */
      taskCreationScope: isAdmin(req.user) ? 'ORG' : req.user.taskCreationScope,
    });
  }

  @Get(':id/suggested-employees')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Get suggested employees for a task with scoring' })
  async getSuggestedEmployees(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getSuggestedEmployees({
      taskId: id,
      // Where this caller may ASSIGN, resolved from their role grants. The
      // guard above accepts a grant held in any space; the service then checks
      // it against the task's own space, which is the real decision.
      assignSpaceIds: assignSpaceIds(req),
      ...taskActor(req),
    });
  }

  @Post(':id/take')
  @DenyExternal()
  @ApiOperation({ summary: 'Take a place on a task open to your work role — the first to take each place gets it' })
  async take(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.roleTaskTake({ taskId: id, userId: req.user.id, organizationId: req.user.organizationId });
  }

  @Post(':id/return-to-role')
  @DenyExternal()
  @ApiOperation({ summary: 'Hand a role task back to its role (before the work starts); it is offered again' })
  async returnToRole(@Param('id') id: string, @Body() body: ReturnToRoleDto, @Request() req: any) {
    return this.tasksService.roleTaskReturn({
      taskId: id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
      reason: body.reason ?? null,
    });
  }

  @Put(':id/open-role')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Open a task to a work role, change how many it needs, or close it (roleId null)' })
  async setOpenRole(@Param('id') id: string, @Body() body: SetOpenRoleDto, @Request() req: any) {
    return this.tasksService.roleTaskSetOpen({
      taskId: id,
      roleId: body.roleId ?? null,
      spots: body.spots,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
      canAssignTasks: req.user.canAssignTasks,
      assignSpaceIds: assignSpaceIds(req),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.findOne({
      id,
      ...taskActor(req, { crossOrgRead: true }),
    });
  }

  @Put(':id')
  @RequirePermissionInSpace('canCreateTasks')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Request() req: any) {
    this.assertTaskFieldEntitlements(req.user, updateTaskDto);
    return this.tasksQueueService.updateTask({
      id,
      ...updateTaskDto,
      /*
        The guard above passes on a canCreateTasks grant in ANY space when the
        body names none. task-service makes the real decision on the task's
        CURRENT space and on the destination when it moves — from these two.
      */
      canCreateTasks: req.user.canCreateTasks,
      createSpaceIds: grantedSpaceIds(req, 'canCreateTasks'),
      ...taskActor(req),
    });
  }

  @Patch(':id/assign')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Assign a task to an employee' })
  async assign(@Param('id') id: string, @Body() assignTaskDto: AssignTaskDto, @Request() req: any) {
    return this.tasksQueueService.assignTask({
      id,
      ...assignTaskDto,
      // The task's own space decides (task-service assertMayAssign), exactly as
      // for POST /tasks/:id/assignees — the guard only widened.
      assignSpaceIds: assignSpaceIds(req),
      ...taskActor(req),
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update task status (role-based: EMPLOYEE can start/block/complete, others can cancel)' })
  async updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateStatusDto, @Request() req: any) {
    return this.tasksQueueService.updateTaskStatus({
      id,
      ...updateStatusDto,
      ...taskActor(req),
    });
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline task assignment (assigned user)' })
  async declineTask(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.declineTask({
      id,
      ...taskActor(req),
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a task (ADMIN only)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.deleteTask({
      id,
      ...taskActor(req),
    });
  }
}
