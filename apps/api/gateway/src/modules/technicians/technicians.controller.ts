import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Inject, UseInterceptors } from '@nestjs/common';
import { RebillService } from '../../common/billing/rebill.service';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { trackingVisibility } from '../../common/tracking-visibility';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import {
  SERVICE_NAMES,
  CurrentUser,
  CurrentUserData,
  RequirePermissionInSpace,
  isAdmin,
  spacesGranting,
} from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { CreateEmployeeDto, UpdateEmployeeDto, ListEmployeesDto } from './dto';
import { scopeIdsFor } from '../../common/permission-scope';

@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
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
          scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
        },
      ),
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
          scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
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
}
