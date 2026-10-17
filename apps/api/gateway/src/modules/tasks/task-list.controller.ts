import { scopeIdsFor } from '../../common/permission-scope';
import { Controller, Get, Post, Param, Query, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role, isAdmin } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { taskActor } from '../../common/task-actor';
import { normalizeQueryParams } from './tasks-controller-helpers';
import { TasksControllerBase } from './tasks-controller.base';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/**
 * /tasks — lists, counts, reports and role pools. ⚠️ Registered BEFORE
 * TasksController: its one-segment paths (counts, open-for-me, role-*) would
 * otherwise be read as `:id`.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskListController extends TasksControllerBase {
  // Literal route registered before the param route so it can't be shadowed.
  @Post('resync-all')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Re-sync EVERY space's existing tasks onto their workflows (ADMIN only)",
  })
  async resyncAllSpaces(@Request() req: AuthedRequest) {
    return this.tasksService.resyncAllSpaces(callerOrgId(req.user));
  }

  @Post('resync/:spaceId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Re-sync a space's existing tasks onto the space's workflow (ADMIN only)",
  })
  async resyncSpaceWorkflow(@Param('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    return this.tasksService.resyncSpaceWorkflow({
      spaceId,
      organizationId: callerOrgId(req.user),
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks (filtered by role)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter tasks with dueDate >= startDate (ISO date)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter tasks with dueDate <= endDate (ISO date)' })
  @ApiQuery({
    name: 'includeNoDueDate',
    required: false,
    description: 'Include tasks without a dueDate (for Current tab)',
  })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Filter by space (CompanyLocation) ID' })
  @ApiQuery({
    name: 'assignedToMe',
    required: false,
    type: Boolean,
    description: 'Only tasks the caller is on (as lead or co-assignee)',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: Record<string, any>, @Request() req: AuthedRequest) {
    // Normalize query params to handle HTTP parameter pollution (multiple values for same param)
    const normalizedQuery = normalizeQueryParams(query);

    // Sanitize pagination params before forwarding to microservice
    const page = normalizedQuery.page ? Math.max(1, Number(normalizedQuery.page) || 1) : 1;
    const limit = Math.min(normalizedQuery.limit ? Math.max(1, Number(normalizedQuery.limit) || 20) : 20, 500);

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
      assignedToMe: normalizedQuery.assignedToMe === 'true',
      ...taskActor(req, { crossOrgRead: true }),
    });
  }

  @Get('counts')
  @ApiOperation({ summary: 'Get task counts grouped by status or by space' })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Filter counts by space (CompanyLocation) ID' })
  @ApiQuery({ name: 'groupBy', required: false, description: "'status' (default) or 'space'" })
  async getStatusCounts(
    @Query('spaceId') spaceId: string | undefined,
    @Query('groupBy') groupBy: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getStatusCounts({
      ...(spaceId && { spaceId }),
      ...(groupBy && { groupBy }),
      ...taskActor(req),
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
    @Request() req: AuthedRequest,
  ) {
    const who = userId || req.user.id;
    if (who !== req.user.id && !isAdmin(req.user) && !req.user.canViewAllTasks) {
      throw new ForbiddenException('You can only see your own job time');
    }
    return this.tasksService.jobTimeReport({ userId: who, organizationId: callerOrgId(req.user), from, to });
  }

  /**
   * The caller's own: jobs in work (the clock-out sheet), notes they owe (asked
   * on every open) and jobs paused on them (offered at the next clock-in).
   * No permission: the filter IS the authorization — it only ever reads the caller.
   */
  @Get('handover/mine')
  @ApiOperation({ summary: "The caller's jobs in work, handovers owed, and paused jobs" })
  async myHandovers(@Request() req: AuthedRequest) {
    return this.tasksService.myHandovers({ userId: req.user.id, organizationId: callerOrgId(req.user) });
  }

  // ── A task open to a WORK role (shared tasks/role-pool.ts) — literal routes before :id ──

  @Get('open-for-me')
  @DenyExternal()
  @ApiOperation({ summary: 'Tasks open to a work role the caller holds, in the workspace they hold it in' })
  async openForMe(@Request() req: AuthedRequest) {
    return this.tasksService.roleTasksOpenForMe({ userId: req.user.id, organizationId: callerOrgId(req.user) });
  }

  @Get('role-options')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Work roles a task in this workspace can be opened to, with how many hold each' })
  @ApiQuery({ name: 'spaceId', required: true })
  async roleOptions(@Query('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    this.assertMayAssignIn(req, spaceId);
    return this.tasksService.roleTaskOptions({ organizationId: callerOrgId(req.user), spaceId: String(spaceId ?? '') });
  }

  @Get('role-preview')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Before opening a task to a role: who holds it here, who is free now, the best ten' })
  @ApiQuery({ name: 'spaceId', required: true })
  @ApiQuery({ name: 'roleId', required: true })
  async rolePreview(@Query() q: Record<string, string>, @Request() req: AuthedRequest) {
    this.assertMayAssignIn(req, q.spaceId);
    const num = (v?: string) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    return this.tasksService.roleTaskPreview({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      spaceId: String(q.spaceId ?? ''),
      roleId: String(q.roleId ?? ''),
      lat: num(q.lat),
      lng: num(q.lng),
    });
  }

  @Get('role-stats')
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({
    summary: 'Per work role: opened, taken, average minutes to take, still open, overdue, who takes most',
  })
  async roleStats(@Query() q: Record<string, string>, @Request() req: AuthedRequest) {
    const scope = scopeIdsFor(req.user, 'canViewAllTasks');
    const spaceIds = q.spaceId ? (scope === undefined || scope.includes(q.spaceId) ? [q.spaceId] : []) : scope;
    return this.tasksService.roleTaskStats({ organizationId: callerOrgId(req.user), spaceIds, from: q.from, to: q.to });
  }
}
