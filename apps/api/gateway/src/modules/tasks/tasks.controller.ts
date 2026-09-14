import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role, canCreateTaskFor, addOnDef, moduleMonthlyCents, isAdmin, spacesGranting, accessAllowsAnywhere } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { isFeatureEntitled } from '../../common/entitlements';
import {
  CreateTaskDto,
  UpdateTaskDto,
  AssignTaskDto,
  UpdateStatusDto,
  AddAssigneeDto,
  AddChecklistItemDto,
  UpdateChecklistItemDto,
  ReorderChecklistDto,
  CreateDependencyDto,
  AddCommentDto,
  PresignAttachmentDto,
  ConfirmAttachmentDto,
} from './dto';
import { TasksQueueService } from './tasks.queue.service';
import { TasksService } from './tasks.service';

/**
 * Normalize query parameters to handle HTTP parameter pollution.
 * When multiple values are sent for the same parameter (e.g., ?status=NEW&status=COMPLETED),
 * NestJS creates an array. This function takes the first value to prevent errors.
 */
function normalizeQueryParams(query: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(query)) {
    normalized[key] = Array.isArray(value) ? value[0] : value;
  }
  return normalized;
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksQueueService: TasksQueueService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Closes the "set a premium field via the plain task endpoint" backdoor: the
   * dedicated sprints/epics/phases controllers are gated, but sprintId/epicId/
   * phaseId/storyPoints also flow through create/update. Reject (402) any
   * premium field the org's tier/modules don't entitle. DRY via isFeatureEntitled.
   */
  private assertTaskFieldEntitlements(user: any, dto: { sprintId?: string; epicId?: string; phaseId?: string; storyPoints?: number }) {
    const checks: Array<[unknown, string]> = [
      [dto.sprintId, 'sprints'],
      [dto.epicId, 'epics'],
      [dto.phaseId, 'phases'],
      [dto.storyPoints, 'story_points'],
    ];
    for (const [value, feature] of checks) {
      if (value !== undefined && value !== null && value !== '' && !isFeatureEntitled(user, feature)) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            message: `The "${feature}" feature is not available on your plan.`,
            error: 'PlanUpgradeRequired',
            feature,
            // No tier to name — say what it is and what it costs.
            monthlyCents: addOnDef(feature)?.monthlyCents ?? moduleMonthlyCents(feature),
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }
  }

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

    return this.tasksQueueService.createTask({
      ...createTaskDto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
      access: req.user.access, // server-authoritative; task-service enforces the real space
    });
  }

  // Literal route registered before the param route so it can't be shadowed.
  @Post('resync-all')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Re-sync EVERY space's existing tasks onto their workflows (ADMIN only)",
  })
  async resyncAllSpaces(@Request() req: any) {
    return this.tasksService.resyncAllSpaces(req.user.organizationId);
  }

  @Post('resync/:spaceId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Re-sync a space's existing tasks onto the space's workflow (ADMIN only)",
  })
  async resyncSpaceWorkflow(@Param('spaceId') spaceId: string, @Request() req: any) {
    return this.tasksService.resyncSpaceWorkflow({
      spaceId,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks (filtered by role)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter tasks with dueDate >= startDate (ISO date)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter tasks with dueDate <= endDate (ISO date)' })
  @ApiQuery({ name: 'includeNoDueDate', required: false, description: 'Include tasks without a dueDate (for Current tab)' })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Filter by space (CompanyLocation) ID' })
  @ApiQuery({ name: 'assignedToMe', required: false, type: Boolean, description: 'Only tasks the caller is on (as lead or co-assignee)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: Record<string, any>, @Request() req: any) {
    // Normalize query params to handle HTTP parameter pollution (multiple values for same param)
    const normalizedQuery = normalizeQueryParams(query);

    // Sanitize pagination params before forwarding to microservice
    const page = normalizedQuery.page
      ? Math.max(1, Number(normalizedQuery.page) || 1)
      : 1;
    const limit = Math.min(
      normalizedQuery.limit ? Math.max(1, Number(normalizedQuery.limit) || 20) : 20,
      500,
    );

    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.findAll({
      ...normalizedQuery,
      page,
      limit,
      /*
        "Only my own work." Coerced here rather than trusted as a string: a
        query param arrives as "true"/"false"/"1", and `!!'false'` is true.
        Narrowing only — it is ANDed with what the caller may see, so it can
        never widen anybody's visibility.
      */
      assignedToMe: normalizedQuery.assignedToMe === 'true' || normalizedQuery.assignedToMe === true,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
      // Cross-org shared spaces the caller may view (server-authoritative, from
      // the resolved token grant — never client input).
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? []).map((s: any) => s.spaceId),
    });
  }

  @Get('counts')
  @ApiOperation({ summary: 'Get task counts grouped by status or by space' })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Filter counts by space (CompanyLocation) ID' })
  @ApiQuery({ name: 'groupBy', required: false, description: "'status' (default) or 'space'" })
  async getStatusCounts(
    @Query('spaceId') spaceId: string | undefined,
    @Query('groupBy') groupBy: string | undefined,
    @Request() req: any,
  ) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getStatusCounts({
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
      ...(spaceId && { spaceId }),
      ...(groupBy && { groupBy }),
    });
  }

  @Get(':id/suggested-employees')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Get suggested employees for a task with scoring' })
  async getSuggestedEmployees(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getSuggestedEmployees({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      // Where this caller may ASSIGN, resolved from their role grants. The
      // guard above accepts a grant held in any space; the service then checks
      // it against the task's own space, which is the real decision.
      assignSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canAssignTasks') ?? undefined),
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.findOne({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
      // Cross-org spaces shared with this caller (server-authoritative, from the
      // resolved token grant). GET /tasks forwards these, so a guest could LIST
      // a shared space's tasks and then be refused when opening one.
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? []).map((sp: any) => sp.spaceId),
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
      access: req.user.access, // task-service enforces the real space for foreign tasks
    });
  }

  @Patch(':id/assign')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Assign a task to an employee' })
  async assign(@Param('id') id: string, @Body() assignTaskDto: AssignTaskDto, @Request() req: any) {
    return this.tasksQueueService.assignTask({
      id,
      ...assignTaskDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
      access: req.user.access, // task-service enforces the real space for foreign tasks
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update task status (role-based: EMPLOYEE can start/block/complete, others can cancel)' })
  async updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateStatusDto, @Request() req: any) {
    return this.tasksQueueService.updateTaskStatus({
      id,
      ...updateStatusDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
      access: req.user.access, // server-authoritative; task-service enforces the real space for foreign tasks
    });
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline task assignment (assigned user)' })
  async declineTask(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.declineTask({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a task (ADMIN only)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.deleteTask({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get task timeline/activity' })
  async getTimeline(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getTimeline({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a task' })
  async addComment(@Param('id') id: string, @Body() body: AddCommentDto, @Request() req: any) {
    return this.tasksQueueService.addComment({
      taskId: id,
      ...body,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get task comments' })
  async getComments(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getComments({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Assignee Endpoints ============

  @Post(':id/assignees')
  /*
    Space-aware: the org-wide column refused a supervisor the right to add a
    second person to a job at their OWN site, while that job sat on their task
    list. The guard widens; `assertMayAssign` in the service decides, against
    the task's real space — never a client-supplied one.
  */
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Add an assignee to a task' })
  async addAssignee(
    @Param('id') id: string,
    @Body() addAssigneeDto: AddAssigneeDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.addAssignee({
      taskId: id,
      ...addAssigneeDto,
      requestUserId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      // Where this caller may ASSIGN, resolved from their role grants. The
      // guard above accepts a grant held in any space; the service then checks
      // it against the task's own space, which is the real decision.
      assignSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canAssignTasks') ?? undefined),
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/assignees/:userId')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Remove an assignee from a task' })
  async removeAssignee(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.removeAssignee({
      taskId: id,
      userId,
      requestUserId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      // Where this caller may ASSIGN, resolved from their role grants. The
      // guard above accepts a grant held in any space; the service then checks
      // it against the task's own space, which is the real decision.
      assignSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canAssignTasks') ?? undefined),
      organizationId: req.user.organizationId,
    });
  }

  // ============ Checklist Endpoints ============

  /*
     ⚠️ No module gate existed on any of these. A workspace that had not
     switched checklists on could still use them.

     A checklist lives on a task but is written through its own routes, so it can
     be refused without refusing the task.
  */
  @RequireModule('checklists')
  @Post(':id/checklist')
  @ApiOperation({ summary: 'Add a checklist item to a task' })
  async addChecklistItem(
    @Param('id') id: string,
    @Body() addChecklistItemDto: AddChecklistItemDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.addChecklistItem({
      taskId: id,
      ...addChecklistItemDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @RequireModule('checklists')
  @Patch(':id/checklist/reorder')
  @ApiOperation({ summary: 'Reorder checklist items' })
  async reorderChecklist(
    @Param('id') id: string,
    @Body() reorderChecklistDto: ReorderChecklistDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.reorderChecklist({
      taskId: id,
      ...reorderChecklistDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @RequireModule('checklists')
  @Patch(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Update a checklist item (text or toggle completion)' })
  async updateChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() updateChecklistItemDto: UpdateChecklistItemDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.updateChecklistItem({
      taskId: id,
      itemId,
      ...updateChecklistItemDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @RequireModule('checklists')
  @Delete(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Delete a checklist item' })
  async deleteChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.deleteChecklistItem({
      taskId: id,
      itemId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
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
  async createSubtask(
    @Param('id') id: string,
    @Body() createTaskDto: CreateTaskDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.createSubtask({
      ...createTaskDto,
      parentId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canCreateTasks: req.user.canCreateTasks,
      createSpaceIds: isAdmin(req.user)
        ? undefined
        : (spacesGranting(req.user?.access, 'canCreateTasks') ?? undefined),
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/subtasks')
  @ApiOperation({ summary: 'Get subtasks of a task' })
  async getSubtasks(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.getSubtasks({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
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
    @Request() req: any,
  ) {
    return this.tasksQueueService.addDependency({
      ...createDependencyDto,
      successorId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canCreateTasks: req.user.canCreateTasks,
      createSpaceIds: isAdmin(req.user)
        ? undefined
        : (spacesGranting(req.user?.access, 'canCreateTasks') ?? undefined),
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
  async removeDependency(
    @Param('id') _id: string,
    @Param('depId') depId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.removeDependency({
      dependencyId: depId,
      userId: req.user.id,
      userRole: req.user.role,
      canCreateTasks: req.user.canCreateTasks,
      createSpaceIds: isAdmin(req.user)
        ? undefined
        : (spacesGranting(req.user?.access, 'canCreateTasks') ?? undefined),
      organizationId: req.user.organizationId,
    });
  }

  // ============ Attachment Endpoints ============

  /*
     ⚠️ No module gate existed on any of these. A workspace that had not
     switched attachments on could still use them.

     Refused at the presign, before a byte is uploaded — the confirm below is
     gated too, so a stale URL cannot finish the job either.
  */
  @RequireModule('attachments')
  @Post(':id/attachments/presign')
  @ApiOperation({ summary: 'Get presigned URL for uploading an attachment' })
  async getPresignedUrl(
    @Param('id') id: string,
    @Body() body: PresignAttachmentDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.getPresignedUrl({
      taskId: id,
      fileName: body.fileName,
      fileType: body.fileType,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @RequireModule('attachments')
  @Post(':id/attachments')
  @ApiOperation({ summary: 'Confirm attachment upload after S3 upload' })
  async addAttachment(
    @Param('id') id: string,
    @Body() body: ConfirmAttachmentDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.addAttachment({
      taskId: id,
      fileName: body.fileName,
      fileKey: body.fileKey,
      fileUrl: body.fileUrl,
      fileType: body.fileType,
      fileSize: body.fileSize ?? 0,
      uploadedById: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'Get task attachments' })
  async getAttachments(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getAttachments({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @RequireModule('attachments')
  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.deleteAttachment({
      id: attachmentId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      // "View all tasks" held in a SPACE means all tasks in THAT space. The
      // flag above is the org-wide answer; without this a member granted it by
      // a space role saw only what was assigned to them — including tasks they
      // had just created themselves.
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }
}
