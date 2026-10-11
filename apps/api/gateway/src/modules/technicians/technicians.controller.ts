import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Inject,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { RebillService } from '../../common/billing/rebill.service';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { trackingVisibility } from '../../common/tracking-visibility';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, SERVICE_NAMES, CurrentUser, CurrentUserData, RequireAccessModule, RequirePermissionInSpace, isAdmin, spacesGranting, clampListLimit } from '@hbcfield/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  ListEmployeesDto,
  RequestTimeOffDto,
} from './dto';
import { LeaveCountQueryDto } from '../calendar/calendar.dto';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';

/**
 * Whose LEAVE this caller decides — approving a request, adjusting a balance, starting balances:
 * the rota permission. Undefined = org-wide (an administrator, or the permission held org-wide),
 * [ids] = the people of those workspaces (narrowed in task-service), [] = nobody.
 */
function leaveWriteScope(user: CurrentUserData | undefined): string[] | undefined {
  if (user && isAdmin(user as never)) return undefined;
  return spacesGranting(user?.access as never, 'canManageRota') ?? undefined;
}

/** Whose leave this caller may READ besides their own: the rota permission or the view permission. */
function leaveReadScope(user: CurrentUserData | undefined): string[] | undefined {
  const rota = spacesGranting(user?.access as never, 'canManageRota');
  const view = spacesGranting(user?.access as never, 'canViewAllTasks');
  if (user?.role === Role.ADMIN || rota === null || view === null) return undefined;
  return [...new Set([...(rota ?? []), ...(view ?? [])])];
}

@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly billing: RebillService,
    private readonly authCache: AuthTokenCache,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  // ============================================================================
  // LIST & SEARCH
  // ============================================================================

  @Get()
  @ApiOperation({ summary: 'List employees with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Employees list retrieved' })
  /*
    Space-aware. "View all tasks" held by a SPACE role means all of that
    space's work — and its people. Asking the org-wide column refused a
    supervisor the roster of the site they run.

    The scope narrows the QUERY, not its result: this route is counted and
    paged, so a filter applied afterwards would leave `total` describing a
    different set than the page.
  */
  @RequirePermissionInSpace('canViewAllTasks')
  async listEmployees(
    @Query() query: ListEmployeesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send(
        { cmd: 'list_technicians' },
        {
          ...query,
          organizationId: user.organizationId,
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, 'canViewAllTasks') ?? undefined,
        },
      ),
    );
  }

  // ============================================================================
  // AVAILABILITY (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Get('availability')
  @ApiOperation({ summary: 'Get all employees availability for a date or date range' })
  @ApiResponse({ status: 200, description: 'Availability retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getAvailability(
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const now = new Date();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    // Validate and check all provided dates
    for (const d of [date, startDate, endDate].filter(Boolean) as string[]) {
      if (!datePattern.test(d)) {
        throw new ForbiddenException('Invalid date format. Use YYYY-MM-DD');
      }
      if (Math.abs(new Date(d).getTime() - now.getTime()) > ninetyDays) {
        throw new ForbiddenException('Date must be within 90 days of today');
      }
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technicians_availability' },
        {
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, 'canViewAllTasks') ?? undefined,
          organizationId: user?.organizationId,
          date,
          startDate,
          endDate,
        },
      ),
    );
  }

  // ============================================================================
  // ORG-WIDE TIME-OFF (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Get('me/request-options')
  // The same tab as making a request — an external member holds no time_off.
  @RequireAccessModule('time_off')
  @ApiOperation({ summary: 'What the caller may request (kinds), and at which workspaces a remote day' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getRequestOptions(@CurrentUser() user: CurrentUserData) {
    // Only the caller's own options: the ids come from the token, never the request.
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_request_options' }, { userId: user.id, organizationId: user.organizationId }),
    );
  }

  @Get('floor-now')
  @ApiOperation({ summary: 'Who is on the floor right now, per workspace' })
  @ApiResponse({ status: 200, description: 'Live floor state retrieved' })
  /*
    Gated on attendance, not on tasks.

    This says who clocked in, who has stepped away and who has not turned up —
    which is attendance, whatever screen it is drawn on. Reusing the time-off
    gate would have let anyone who can see a leave request read the shift state
    of everybody in the workspace, and those are not the same authority.
  */
  @RequirePermissionInSpace('canViewSpaceAttendance')
  async getFloorNow(@CurrentUser() user?: CurrentUserData) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_floor_now' },
        {
          organizationId: user?.organizationId,
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never)
            ? undefined
            : spacesGranting(user?.access as never, 'canViewSpaceAttendance') ?? undefined,
        },
      ),
    );
  }

  @Get('cover-range')
  @ApiOperation({ summary: 'Cover per workspace per day, for the leave chart footer' })
  @ApiQuery({ name: 'start', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'end', required: true, description: 'YYYY-MM-DD' })
  /*
    Gated on ATTENDANCE, not on tasks — and deliberately not on the gate of the
    leave list it is drawn under.

    `canViewAllTasks` is held by the External Observer seat, whose whole purpose
    is to watch the work and raise a job. Staffing levels are not the work: how
    many people a company has on the floor each day is its own business, and
    reusing the task gate here would be the same mistake the asset audit found —
    one permission doing duty for two different things.
  */
  @RequirePermissionInSpace('canViewSpaceAttendance')
  async getCoverRange(
    @Query('start') start: string,
    @Query('end') end: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Rejected here rather than trusted downstream: the range drives a day loop.
    const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DAY.test(start ?? '') || !ISO_DAY.test(end ?? '') || end < start) {
      throw new BadRequestException('start and end must be dates (YYYY-MM-DD), and end must not be before start');
    }
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_cover_range' },
        {
          organizationId: user?.organizationId,
          start,
          end,
          scopeSpaceIds: isAdmin(user as never)
            ? undefined
            : spacesGranting(user?.access as never, 'canViewSpaceAttendance') ?? undefined,
        },
      ),
    );
  }

  @Get('time-off')
  @ApiOperation({ summary: 'Time-off requests: the organization, or the spaces the caller leads' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD — with `to`: leave touching the window + every pending request' })
  @ApiQuery({ name: 'to', required: false })
  @ApiResponse({ status: 200, description: 'Time-off requests retrieved' })
  /*
    Space-aware. Leave belongs to a person and `TimeOff` has no space column, so
    this read looked impossible to scope and stayed org-wide — a supervisor
    could not see their own crew's leave, which is half of running a rota. The
    claim is over the PEOPLE though, so the service narrows through the roster.
  */
  @RequirePermissionInSpace('canViewAllTasks')
  async getOrgTimeOff(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED',
    @CurrentUser() user?: CurrentUserData,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    /*
      The cover verdict rides on this list, and it must not widen who reads it.

      The list itself is gated on `canViewAllTasks`, which the External Observer
      seat holds — watching the work is what it is for. Staffing levels are not
      the work, so the projection is attached only for a caller who also holds
      attendance. Everyone else gets exactly the list they got before, and the
      four cover queries are not even run for them.
    */
    const canSeeCover =
      isAdmin(user as never) ||
      (spacesGranting(user?.access as never, 'canViewSpaceAttendance') ?? []).length > 0;

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_org_time_off' },
        {
          organizationId: user?.organizationId,
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, 'canViewAllTasks') ?? undefined,
          withCover: canSeeCover,
          status,
          // Validated in the service (a malformed day is ignored, not trusted).
          from: typeof from === 'string' ? from.slice(0, 10) : undefined,
          to: typeof to === 'string' ? to.slice(0, 10) : undefined,
        },
      ),
    );
  }

  // ============================================================================
  // TIME-OFF APPROVAL (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Patch('time-off/:timeOffId/approve')
  @ApiOperation({ summary: 'Approve or reject a time-off request' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @ApiResponse({ status: 200, description: 'Time-off request processed' })
  // Space-aware: the service checks the request's OWN person against the spaces
  // this approver leads, so widening the guard cannot widen the authority.
  @RequirePermissionInSpace('canManageRota')
  async approveTimeOff(
    @Param('timeOffId') timeOffId: string,
    @Body() body: { approved: boolean; rejectionReason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'approve_time_off' },
        {
          timeOffId,
          organizationId: user.organizationId,
          approverId: user.id,
          scopeSpaceIds: leaveWriteScope(user),
          approved: body.approved,
          rejectionReason: body.rejectionReason,
        },
      ),
    );
  }

  @Post('time-off/manual')
  @ApiOperation({ summary: 'Admin: add an already-approved day off for an employee' })
  @RequirePermission('canManageRota')
  async addTimeOff(
    @Body() body: { technicianId: string; startDate: string; endDate: string; reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'add_time_off' },
        {
          editorId: user.id,
          organizationId: user.organizationId,
          technicianId: body.technicianId,
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason,
        },
      ),
    );
  }

  @Patch('time-off/:timeOffId')
  @ApiOperation({ summary: 'Admin: edit an existing day off (dates / reason)' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @RequirePermission('canManageRota')
  async updateTimeOff(
    @Param('timeOffId') timeOffId: string,
    @Body() body: { startDate?: string; endDate?: string; reason?: string | null },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'update_time_off' },
        {
          organizationId: user.organizationId,
          timeOffId,
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason,
        },
      ),
    );
  }

  @Delete('time-off/:timeOffId/manage')
  @ApiOperation({ summary: 'Admin: delete a day off' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @RequirePermission('canManageRota')
  async adminDeleteTimeOff(
    @Param('timeOffId') timeOffId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'admin_delete_time_off' },
        { organizationId: user.organizationId, timeOffId },
      ),
    );
  }

  @Post('time-off/bulk-approve')
  @ApiOperation({ summary: 'Bulk approve or reject time-off requests' })
  @RequirePermission('canManageRota')
  async bulkApproveTimeOff(
    @Body() body: { timeOffIds: string[]; approved: boolean; rejectionReason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body.timeOffIds || body.timeOffIds.length === 0) {
      return { success: false, message: 'No time-off IDs provided' };
    }
    if (body.timeOffIds.length > 50) {
      return { success: false, message: 'Maximum 50 requests per bulk operation' };
    }

    const results = await Promise.allSettled(
      body.timeOffIds.map(timeOffId =>
        firstValueFrom(
          this.taskClient.send(
            { cmd: 'approve_time_off' },
            {
              timeOffId,
              organizationId: user.organizationId,
              approverId: user.id,
              approved: body.approved,
              rejectionReason: body.rejectionReason,
            },
          ),
        ),
      ),
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return {
      success: true,
      data: { succeeded, failed, total: body.timeOffIds.length },
    };
  }

  @Delete('time-off/:timeOffId')
  @ApiOperation({ summary: 'Cancel a time-off request' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @ApiResponse({ status: 200, description: 'Time-off request canceled' })
  @Roles(Role.EMPLOYEE)
  async cancelTimeOff(
    @Param('timeOffId') timeOffId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'cancel_time_off' },
        {
          timeOffId,
          technicianId: user.id,
        },
      ),
    );
  }

  // ============================================================================
  // THE LEAVE LEDGER (shared leave/leave-ledger.ts) — before /:id routes
  //
  // Writing somebody's balance is deciding their leave: the same permission and scope as
  // approving it (`canManageRota`, narrowed to the person's workspaces in task-service), and
  // nobody adjusts their own (an organization administrator excepted). Every write is also a
  // line in the ledger itself, with who and when — and in the audit log (audit-helpers.ts).
  // ============================================================================

  @Get('leave-opening')
  @DenyExternal()
  @ApiOperation({ summary: 'Starting balances: members in scope with what is saved for the leave year containing `on`' })
  @RequirePermissionInSpace('canManageRota')
  async getLeaveOpening(@Query('on') on: string | undefined, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_leave_opening' }, {
        organizationId: user.organizationId,
        scopeSpaceIds: leaveWriteScope(user),
        on: typeof on === 'string' ? on.slice(0, 10) : undefined,
      }),
    );
  }

  @Post('leave-opening/match')
  @DenyExternal()
  @ApiOperation({ summary: 'Read a pasted table and match each line to a member (email, then full name). Writes nothing.' })
  @RequirePermissionInSpace('canManageRota')
  async matchLeaveOpening(@Body() body: { text?: string }, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'match_leave_opening' }, {
        organizationId: user.organizationId,
        scopeSpaceIds: leaveWriteScope(user),
        text: body?.text,
      }),
    );
  }

  @Post('leave-opening')
  @DenyExternal()
  @ApiOperation({ summary: 'Save starting balances (used before HBCField, carried) — one transaction, ≤ 500 people' })
  @RequirePermissionInSpace('canManageRota')
  async saveLeaveOpening(
    @Body() body: { on?: string; rows?: Array<{ userId: string; used: number; carried: number }> },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'save_leave_opening' }, {
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: leaveWriteScope(user),
        on: body?.on,
        rows: body?.rows,
      }),
    );
  }

  @Post('leave-adjustments/:adjustmentId/void')
  @DenyExternal()
  @ApiOperation({ summary: 'Undo a ledger line — it stays visible and counts for nothing' })
  @ApiParam({ name: 'adjustmentId', description: 'Ledger line ID' })
  @RequirePermissionInSpace('canManageRota')
  async voidLeaveAdjustment(@Param('adjustmentId') adjustmentId: string, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'void_leave_adjustment' }, {
        adjustmentId,
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: leaveWriteScope(user),
      }),
    );
  }

  @Get(':id/leave-adjustments')
  @ApiOperation({ summary: "One leave year's ledger lines (who, when, why). A member reads their own." })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async listLeaveAdjustments(
    @Param('id') id: string,
    @Query('on') on: string | undefined,
    @Query('year') year: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const scope = leaveReadScope(user);
    if (user.id !== id && scope !== undefined && scope.length === 0) throw new ForbiddenException('You can only view your own leave balance');
    const write = (user as { isExternal?: boolean }).isExternal ? [] : leaveWriteScope(user);
    return firstValueFrom(
      this.taskClient.send({ cmd: 'list_leave_adjustments' }, {
        technicianId: id,
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: scope,
        // Only to answer `canEdit` — 'ORG' because an undefined key does not survive the transport.
        editScope: write === undefined ? 'ORG' : write.length ? write : null,
        on: typeof on === 'string' ? on.slice(0, 10) : undefined,
        year,
      }),
    );
  }

  @Post(':id/leave-adjustments')
  @DenyExternal()
  @ApiOperation({ summary: 'Add a ledger line: used before HBCField, a correction, or extra days granted' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @RequirePermissionInSpace('canManageRota')
  async addLeaveAdjustment(
    @Param('id') id: string,
    @Body() body: { kind?: string; days?: number; on?: string; reason?: string | null },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'add_leave_adjustment' }, {
        technicianId: id,
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: leaveWriteScope(user),
        // Read in task-service with the shared parseLeaveAdjustment — never trusted here.
        body: { kind: body?.kind, days: body?.days, on: body?.on, reason: body?.reason },
      }),
    );
  }

  // ============================================================================
  // CREATE
  // ============================================================================

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  @ApiResponse({ status: 201, description: 'Employee created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @RequirePermission('canManageUsers')
  async createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send(
        { cmd: 'create_technician' },
        {
          ...dto,
          organizationId: user.organizationId,
        },
      ),
    );
    this.billing.rebill(user.organizationId);
    return result;
  }

  // ============================================================================
  // GET DETAIL
  // ============================================================================

  @Get(':id')
  @ApiOperation({ summary: 'Get employee detail with stats' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Employee detail retrieved' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeeDetail(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send(
        { cmd: 'get_technician_detail' },
        {
          id,
          organizationId: user.organizationId,
          /*
            Who is asking, so the answer can be layered.

            This route carries no permission decorator by design — every member
            needs to open a colleague's card from a roster they already see. So
            the scoping is in the payload rather than the guard:

              null           org-wide viewer (admin, or a manager holding
                             canViewAllTasks / canManageUsers org-wide) — the
                             full record, as before
              [space ids]    a member whose authority is per-space: they may
                             open somebody they SHARE a space with, and the
                             numbers cover those spaces only

            Computed server-side from the resolved grant, never from the client.
          */
          viewerSpaceIds: isAdmin(user as any) || user.canViewAllTasks || user.canManageUsers
            ? null
            : Array.from(
                new Set([
                  ...(spacesGranting((user as any)?.access, 'canViewAllTasks') ?? []),
                  ...(spacesGranting((user as any)?.access, 'canViewSpaceAttendance') ?? []),
                ]),
              ),
          // Coordinates are their own permission — see lastLocation in the
          // service. Resolved access, not the flat column (common/tracking-visibility.ts).
          ...trackingVisibility(user),
        },
      ),
    );
  }

  // ============================================================================
  // STATS (Basic task stats)
  // ============================================================================

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get employee basic task stats' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Stats retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeeStats(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Route to task-service for task stats (task data lives there)
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_stats' },
        {
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, 'canViewAllTasks') ?? undefined,
          id,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  @Patch(':id')
  @ApiOperation({ summary: 'Update an employee' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Employee updated' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequirePermission('canManageUsers')
  async updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send(
        { cmd: 'update_technician' },
        {
          id,
          organizationId: user.organizationId,
          dto,
        },
      ),
    );
    // employmentType (and access) changes can flip a member's billable seat type
    // (in-house ⇄ external field), so re-sync seats to Stripe after the edit.
    this.billing.rebill(user.organizationId);
    /*
      Their sessions carry who they are (active, role, grants) in the gateway's
      auth cache. A member switched off here kept working until it expired —
      `isActive: false` must bite on their next request, and any other change
      to their access should show there too.
    */
    await this.authCache.invalidateUser(id).catch(() => undefined);
    return result;
  }

  // ============================================================================
  // DEACTIVATE (Soft Delete)
  // ============================================================================

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate an employee (soft delete)' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Employee deactivated' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot deactivate employee with active tasks',
  })
  @RequirePermission('canManageUsers')
  async deactivateEmployee(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send(
        { cmd: 'deactivate_technician' },
        {
          id,
          organizationId: user.organizationId,
        },
      ),
    );
    this.billing.rebill(user.organizationId);
    // A deactivated member is refused on their NEXT request, not when the
    // gateway's cached copy of their session happens to expire.
    await this.authCache.invalidateUser(id).catch(() => undefined);
    return result;
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get employee performance metrics' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeePerformance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Route to task-service for performance metrics (task data lives there)
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_performance' },
        {
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, 'canViewAllTasks') ?? undefined,
          id,
          organizationId: user?.organizationId,
          startDate,
          endDate,
        },
      ),
    );
  }

  // ============================================================================
  // TASKS
  // ============================================================================

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get employee task history' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Task history retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeeTasks(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    // Optional due-date window — used by the leave drawer to show what is
    // already booked while somebody wants to be away.
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Route to task-service for task history (task data lives there)
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_task_history' },
        {
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, 'canViewAllTasks') ?? undefined,
          id,
          organizationId: user?.organizationId,
          status,
          startDate,
          endDate,
          page: page ? Math.max(1, Number(page) || 1) : 1,
          limit: clampListLimit(limit, 20, 500),
        },
      ),
    );
  }

  // ============================================================================
  // ATTENDANCE
  // ============================================================================

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Get employee attendance history' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Attendance history retrieved' })
  // Space-aware, like every other attendance read: a member whose grant comes
  // from a space role may see this history, narrowed to the spaces they hold.
  @RequirePermissionInSpace('canViewSpaceAttendance')
  async getEmployeeAttendance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_attendance_history' },
        {
          userId: id,
          organizationId: user?.organizationId,
          scopeSpaceIds: isAdmin(user as any)
            ? null
            : spacesGranting((user as any)?.access, 'canViewSpaceAttendance'),
          startDate,
          endDate,
        },
      ),
    );
  }

  // ============================================================================
  // LOCATION ASSIGNMENTS
  // ============================================================================

  @Get(':id/assignments')
  @ApiOperation({ summary: 'Get employee location assignments' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Assignments retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeeAssignments(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_assignments' },
        {
          // undefined = org-wide; [] = granted nowhere and matches nothing.
          scopeSpaceIds: isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, 'canViewAllTasks') ?? undefined,
          userId: id,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  // ============================================================================
  // SCHEDULE MANAGEMENT
  // ============================================================================

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get employee weekly schedule' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Schedule retrieved' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getEmployeeSchedule(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Managers (EMPLOYEE + canViewAllTasks) can view any member; plain employees
    // only their own (D9 — was ADMIN-only, which locked managers out).
    const privileged = user.role === Role.ADMIN || !!user.canViewAllTasks;
    if (!privileged && user.id !== id) {
      throw new ForbiddenException('You can only view your own schedule');
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_schedule' },
        {
          technicianId: id,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Set employee weekly schedule' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Schedule updated' })
  @RequirePermission('canManageRota')
  async setEmployeeSchedule(
    @Param('id') id: string,
    @Body() body: { schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive?: boolean; notes?: string }> },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'set_technician_schedule' },
        {
          technicianId: id,
          organizationId: user.organizationId,
          requesterId: user.id,
          schedule: body.schedule,
        },
      ),
    );
  }

  // ============================================================================
  // TIME-OFF MANAGEMENT
  // ============================================================================

  @Get(':id/time-off')
  @ApiOperation({ summary: 'Get employee time-off requests' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Time-off requests retrieved' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getEmployeeTimeOff(
    @Param('id') id: string,
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED',
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Managers (EMPLOYEE + canViewAllTasks) can view any member's time-off;
    // plain employees only their own (D9).
    const privileged = user?.role === Role.ADMIN || !!user?.canViewAllTasks;
    if (!privileged && user?.id !== id) {
      throw new ForbiddenException('You can only view your own time-off requests');
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_time_off' },
        {
          technicianId: id,
          organizationId: user?.organizationId,
          status,
        },
      ),
    );
  }

  @Get(':id/leave-balance')
  @ApiOperation({ summary: "This year's vacation allowance, taken and remaining" })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getLeaveBalance(
    @Param('id') id: string,
    @Query('on') on?: string,
    @Query('year') year?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Same rule as the list above: a manager may read anyone's, a member only
    // their own. An allowance says what someone is entitled to and how much
    // they have used, which is theirs, not the team's.
    const privileged = user?.role === Role.ADMIN || !!user?.canViewAllTasks;
    if (!privileged && user?.id !== id) {
      throw new ForbiddenException('You can only view your own leave balance');
    }
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_leave_balance' }, {
        technicianId: id,
        organizationId: user?.organizationId,
        // The leave year containing `on` (default today); `year` = the one starting in that year.
        on: typeof on === 'string' ? on.slice(0, 10) : undefined,
        year,
      }),
    );
  }

  @Get(':id/time-off/count')
  @ApiOperation({ summary: 'What a leave range would cost — weekends, rota rest days and holidays left out' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async countLeave(
    @Param('id') id: string,
    @Query() q: LeaveCountQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Your own, or somebody you manage: an admin or org-wide view reaches everyone, the rota
    // permission held in a workspace reaches that workspace's people (narrowed in the service).
    const scope = leaveReadScope(user);
    if (user?.id !== id && scope !== undefined && scope.length === 0) throw new ForbiddenException('You can only count your own leave');
    return firstValueFrom(
      this.taskClient.send({ cmd: 'count_leave' }, { technicianId: id, organizationId: user.organizationId, from: q.from, to: q.to, callerId: user.id, scopeSpaceIds: scope }),
    );
  }

  @Post(':id/time-off')
  // Creating a request needs the tab; cancelling one (DELETE below) deliberately does not.
  @RequireAccessModule('time_off')
  @ApiOperation({ summary: 'Request time off for employee' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 201, description: 'Time-off request created' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async requestTimeOff(
    @Param('id') id: string,
    @Body() body: RequestTimeOffDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Employees can only request time off for themselves
    if (user.role === Role.EMPLOYEE && user.id !== id) {
      throw new ForbiddenException('You can only request time off for yourself');
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'request_time_off' },
        {
          id: body.id,
          technicianId: id,
          organizationId: user.organizationId,
          // The request itself, as sent: task-service reads it with the shared
          // `parseRequestInput` (defaults: LEAVE, VACATION — what older clients send).
          kind: body.kind,
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason,
          type: body.type,
          spaceId: body.spaceId,
          startTime: body.startTime,
          endTime: body.endTime,
          minutes: body.minutes,
        },
      ),
    );
  }

}
