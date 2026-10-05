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
import { Role, addOnDef, moduleMonthlyCents, isAdmin, spacesGranting, accessAllowsAnywhere } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
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
  HandoverDto,
  ResumeWorkDto,
  CrewJoinDto,
  CrewLeaveDto,
  CrewIssueDto,
  ChangeLeadDto,
  PresignAttachmentDto,
  ConfirmAttachmentDto,
  SetOpenRoleDto,
  ReturnToRoleDto,
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
      const granted = spacesGranting(req.user?.access, 'canAssignTasks') ?? [];
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

  /**
   * One worker's job time over a period — travel, working, blocked, and the time
   * on the clock beside it. Your own always; somebody else's needs the
   * organization-wide view of every task (an admin, or "view all tasks").
   */
  @Get('job-time/report')
  @ApiOperation({ summary: "A worker's job time over a period" })
  async jobTimeReport(
    @Query('userId') userId: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
    @Request() req: any,
  ) {
    const who = userId || req.user.id;
    if (who !== req.user.id && !isAdmin(req.user) && !req.user.canViewAllTasks) {
      throw new ForbiddenException("You can only see your own job time");
    }
    return this.tasksService.jobTimeReport({ userId: who, organizationId: req.user.organizationId, from, to });
  }

  /**
   * The caller's own: jobs in work (the clock-out sheet), notes they owe (asked
   * on every open) and jobs paused on them (offered at the next clock-in).
   * No permission: the filter IS the authorization — it only ever reads the caller.
   */
  @Get('handover/mine')
  @ApiOperation({ summary: "The caller's jobs in work, handovers owed, and paused jobs" })
  async myHandovers(@Request() req: any) {
    return this.tasksService.myHandovers({ userId: req.user.id, organizationId: req.user.organizationId });
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

  // ── A task open to a WORK role (shared tasks/role-pool.ts) — literal routes before :id ──

  @Get('open-for-me')
  @DenyExternal()
  @ApiOperation({ summary: 'Tasks open to a work role the caller holds, in the workspace they hold it in' })
  async openForMe(@Request() req: any) {
    return this.tasksService.roleTasksOpenForMe({ userId: req.user.id, organizationId: req.user.organizationId });
  }

  @Get('role-options')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Work roles a task in this workspace can be opened to, with how many hold each' })
  @ApiQuery({ name: 'spaceId', required: true })
  async roleOptions(@Query('spaceId') spaceId: string, @Request() req: any) {
    this.assertMayAssignIn(req, spaceId);
    return this.tasksService.roleTaskOptions({ organizationId: req.user.organizationId, spaceId: String(spaceId ?? '') });
  }

  @Get('role-preview')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Before opening a task to a role: who holds it here, who is free now, the best ten' })
  @ApiQuery({ name: 'spaceId', required: true })
  @ApiQuery({ name: 'roleId', required: true })
  async rolePreview(@Query() q: Record<string, string>, @Request() req: any) {
    this.assertMayAssignIn(req, q.spaceId);
    const num = (v?: string) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    return this.tasksService.roleTaskPreview({
      userId: req.user.id, organizationId: req.user.organizationId,
      spaceId: String(q.spaceId ?? ''), roleId: String(q.roleId ?? ''), lat: num(q.lat), lng: num(q.lng),
    });
  }

  @Get('role-stats')
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: 'Per work role: opened, taken, average minutes to take, still open, overdue, who takes most' })
  async roleStats(@Query() q: Record<string, string>, @Request() req: any) {
    const scope = isAdmin(req.user) || req.user.canViewAllTasks === true ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? []);
    const spaceIds = q.spaceId ? (scope === undefined || scope.includes(q.spaceId) ? [q.spaceId] : []) : scope;
    return this.tasksService.roleTaskStats({ organizationId: req.user.organizationId, spaceIds, from: q.from, to: q.to });
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
    return this.tasksService.roleTaskReturn({ taskId: id, userId: req.user.id, organizationId: req.user.organizationId, reason: body.reason ?? null });
  }

  @Put(':id/open-role')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Open a task to a work role, change how many it needs, or close it (roleId null)' })
  async setOpenRole(@Param('id') id: string, @Body() body: SetOpenRoleDto, @Request() req: any) {
    return this.tasksService.roleTaskSetOpen({
      taskId: id, roleId: body.roleId ?? null, spots: body.spots,
      userId: req.user.id, userRole: req.user.role, organizationId: req.user.organizationId,
      canAssignTasks: req.user.canAssignTasks,
      assignSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canAssignTasks') ?? undefined),
    });
  }

  /** May the caller assign work in this workspace? (org-wide, or a space grant there) */
  private assertMayAssignIn(req: any, spaceId?: string) {
    if (isAdmin(req.user) || req.user.canAssignTasks === true) return;
    if (spaceId && (spacesGranting(req.user?.access, 'canAssignTasks') ?? []).includes(spaceId)) return;
    throw new ForbiddenException('You do not have permission to assign work in this workspace');
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

  /** "Resume work" on a job paused at a clock-out. The clock gate applies. */
  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume work on a job paused at a clock-out' })
  async resumeWork(@Param('id') id: string, @Body() body: ResumeWorkDto, @Request() req: any) {
    return this.tasksQueueService.resumeWork({
      id,
      ...body,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /** "What I did, and what is left" — by somebody on the job, or who owes the note. */
  @Post(':id/handover')
  @ApiOperation({ summary: 'Write the handover note for a job' })
  async addHandover(@Param('id') id: string, @Body() body: HandoverDto, @Request() req: any) {
    return this.tasksQueueService.addHandover({
      ...body,
      taskId: id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  // ─── A crew on one job (packages/shared/src/tasks/crew.ts) ───
  // No route permission: the caller's place on THIS job's crew is the
  // authorization, checked in task-service. External members hold no clock
  // and work no job of ours.

  /** The facts every crew route passes: who, and the grants the office acts on. */
  private crewActor(req: any) {
    return {
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      access: req.user.access,
    };
  }

  @Post(':id/crew/join')
  @DenyExternal()
  @ApiOperation({ summary: 'Join a crew job (own tap, "I\'m with him", or the office for somebody)' })
  async crewJoin(@Param('id') id: string, @Body() body: CrewJoinDto, @Request() req: any) {
    return this.tasksQueueService.crewJoin({ ...body, taskId: id, ...this.crewActor(req) });
  }

  @Post(':id/crew/leave')
  @DenyExternal()
  @ApiOperation({ summary: 'Leave a crew job' })
  async crewLeave(@Param('id') id: string, @Body() body: CrewLeaveDto, @Request() req: any) {
    return this.tasksQueueService.crewLeave({ ...body, taskId: id, ...this.crewActor(req) });
  }

  @Post(':id/crew/issue')
  @DenyExternal()
  @ApiOperation({ summary: '"My issue": only the caller\'s own time is blocked' })
  async crewIssue(@Param('id') id: string, @Body() body: CrewIssueDto, @Request() req: any) {
    return this.tasksQueueService.crewSelfIssue({ ...body, taskId: id, ...this.crewActor(req) });
  }

  @Post(':id/crew/resume')
  @DenyExternal()
  @ApiOperation({ summary: 'Back to work after their own stop' })
  async crewResume(@Param('id') id: string, @Body() body: ResumeWorkDto, @Request() req: any) {
    return this.tasksQueueService.crewSelfResume({ ...body, taskId: id, ...this.crewActor(req) });
  }

  @Put(':id/lead')
  @DenyExternal()
  @ApiOperation({ summary: "Hand this job's lead to somebody on its crew — for today, or for good" })
  async changeLead(@Param('id') id: string, @Body() body: ChangeLeadDto, @Request() req: any) {
    return this.tasksQueueService.crewChangeLead({ ...body, taskId: id, ...this.crewActor(req) });
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

  /**
   * The step forms answered on this job, oldest first — each with the form it
   * answered (the snapshot) and its photos / signatures as short-lived signed
   * links. Gated exactly like GET /tasks/:id (the same facts, the same check in
   * task-service). Read only when a report section is opened.
   */
  /** A job's time: travel, working, blocked — per worker, and who started it. */
  @Get(':id/time')
  @ApiOperation({ summary: "A job's time, split into travel, working and blocked" })
  async jobTime(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.jobTime({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? []).map((s: any) => s.spaceId),
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/submissions')
  @ApiOperation({ summary: "The job's step-form submissions (its reports), with signed file links" })
  async getSubmissions(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.getSubmissions({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      organizationId: req.user.organizationId,
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? []).map((sp: any) => sp.spaceId),
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
      // An owner change is judged on the resolved grants (shared tasks/checklist.ts) — never on the body.
      access: req.user.access,
      organizationId: req.user.organizationId,
    });
  }

  @RequireModule('checklists')
  @Patch(':id/checklist/reorder')
  @DenyExternal()
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
      // An owner change is judged on the resolved grants (shared tasks/checklist.ts) — never on the body.
      access: req.user.access,
      organizationId: req.user.organizationId,
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
      // An owner change is judged on the resolved grants (shared tasks/checklist.ts) — never on the body.
      access: req.user.access,
      organizationId: req.user.organizationId,
    });
  }

  @RequireModule('checklists')
  @Delete(':id/checklist/:itemId')
  @DenyExternal()
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
      // Removing somebody else's item is judged on the resolved grants (shared mayEditChecklistItem).
      access: req.user.access,
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
      attachmentId: body.id,
      fileName: body.fileName,
      fileKey: body.fileKey,
      fileUrl: body.fileUrl,
      fileType: body.fileType ?? '',
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
