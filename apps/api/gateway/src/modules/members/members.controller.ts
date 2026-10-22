import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseInterceptors } from '@nestjs/common';
import { RebillService } from '../../common/billing/rebill.service';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { trackingVisibility } from '../../common/tracking-visibility';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CurrentUser, RequirePermissionInSpace, isAdmin, spacesGranting } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { CreateMemberDto, UpdateMemberDto, ListMembersDto } from './dto';
import { scopeIdsFor } from '../../common/permission-scope';
import {
  listTechnicians,
  createTechnician,
  getTechnicianDetail,
  updateTechnician,
  deactivateTechnician,
} from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';
import { getTechnicianStats } from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';

@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
export class MembersController {
  constructor(
    private readonly services: ServiceCalls,
    private readonly billing: RebillService,
    private readonly authCache: AuthTokenCache,
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
  async listEmployees(@Query() query: ListMembersDto, @CurrentUser() user: SessionUser) {
    return this.services.auth.ask(listTechnicians, {
      ...query,
      organizationId: callerOrgId(user),
      // undefined = org-wide; [] = granted nowhere and matches nothing.
      scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
    });
  }

  // ============================================================================
  // CREATE
  // ============================================================================

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  @ApiResponse({ status: 201, description: 'Employee created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @RequirePermission('canManageUsers')
  async createEmployee(@Body() dto: CreateMemberDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(createTechnician, {
      ...dto,
      organizationId: callerOrgId(user),
    });
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
  async getEmployeeDetail(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.services.auth.ask(getTechnicianDetail, {
      id,
      organizationId: callerOrgId(user),
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
      viewerSpaceIds:
        isAdmin(user) || user.canViewAllTasks || user.canManageUsers
          ? null
          : Array.from(
              new Set([
                ...(spacesGranting(user.access, 'canViewAllTasks') ?? []),
                ...(spacesGranting(user.access, 'canViewSpaceAttendance') ?? []),
              ]),
            ),
      // Coordinates are their own permission — see lastLocation in the
      // service. Resolved access, not the flat column (common/tracking-visibility.ts).
      ...trackingVisibility(user),
    });
  }

  // ============================================================================
  // STATS (Basic task stats)
  // ============================================================================

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get employee basic task stats' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Stats retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeeStats(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    // Route to task-service for task stats (task data lives there)
    return this.services.task.ask(getTechnicianStats, {
      // undefined = org-wide; [] = granted nowhere and matches nothing.
      scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
      id,
      organizationId: callerOrgId(user),
    });
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
  async updateEmployee(@Param('id') id: string, @Body() dto: UpdateMemberDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(updateTechnician, {
      id,
      organizationId: callerOrgId(user),
      dto,
    });
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
  async deactivateEmployee(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(deactivateTechnician, {
      id,
      organizationId: user.organizationId,
    });
    this.billing.rebill(user.organizationId);
    // A deactivated member is refused on their NEXT request, not when the
    // gateway's cached copy of their session happens to expire.
    await this.authCache.invalidateUser(id).catch(() => undefined);
    return result;
  }
}
