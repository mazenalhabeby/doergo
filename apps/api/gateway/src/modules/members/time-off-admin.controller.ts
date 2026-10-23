import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Role, CurrentUser, RequirePermissionInSpace } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { scopeFor, scopeIdsFor } from '../../common/permission-scope';
import { leaveWriteScope } from './members-controller-helpers';
import { callerOrgId } from '../../common/caller-org';
import {
  getOrgTimeOff,
  approveTimeOff,
  addTimeOff,
  updateTimeOff,
  adminDeleteTimeOff,
  cancelTimeOff,
  setDayHours,
  getDayHours,
} from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';
import { ApproveTimeOffDto, AddTimeOffDto, UpdateTimeOffDto, SetDayHoursDto } from './dto/leave-bodies.dto';

/**
 * /employees/time-off — the organization's leave: the list, approving, entering,
 * changing, deleting. ⚠️ Registered before MembersController (GET time-off vs
 * GET :id).
 */
@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
export class TimeOffAdminController {
  constructor(private readonly services: ServiceCalls) {}

  @Get('time-off')
  @ApiOperation({ summary: 'Time-off requests: the organization, or the spaces the caller leads' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'YYYY-MM-DD — with `to`: leave touching the window + every pending request',
  })
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
    @Query('status') status: ('PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED') | undefined,
    @CurrentUser() user: SessionUser,
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
    const cover = scopeFor(user, 'canViewSpaceAttendance');
    const canSeeCover = cover === null || cover.length > 0;

    return this.services.task.ask(getOrgTimeOff, {
      // `user` is optional only because it follows optional query params; the route is authenticated.
      organizationId: callerOrgId(user!),
      // undefined = org-wide; [] = granted nowhere and matches nothing.
      scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
      withCover: canSeeCover,
      status,
      // Validated in the service (a malformed day is ignored, not trusted).
      from: typeof from === 'string' ? from.slice(0, 10) : undefined,
      to: typeof to === 'string' ? to.slice(0, 10) : undefined,
    });
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
    @Body() body: ApproveTimeOffDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.services.task.ask(approveTimeOff, {
      timeOffId,
      organizationId: callerOrgId(user),
      approverId: user.id,
      scopeSpaceIds: leaveWriteScope(user),
      approved: body.approved,
      rejectionReason: body.rejectionReason,
    });
  }

  @Post('time-off/manual')
  @ApiOperation({ summary: 'Admin: add an already-approved day off for an employee' })
  @RequirePermission('canManageRota')
  async addTimeOff(@Body() body: AddTimeOffDto, @CurrentUser() user: SessionUser) {
    return this.services.task.ask(addTimeOff, {
      editorId: user.id,
      organizationId: callerOrgId(user),
      technicianId: body.technicianId,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
    });
  }

  /*
    The hours of ONE day, set by the office (docs/plans/time-counting-model.md, phase 2):
    written as an approved changed-hours request; a day already clocked is re-shaped.
    Space-aware: a workspace leader sets hours only in a workspace they lead (checked in the service).
  */
  @Get(':id/day-hours')
  @ApiOperation({ summary: 'What the day-hours form shows: the plan, hours already set, clocked in, leave' })
  @ApiParam({ name: 'id', description: 'Member ID' })
  @RequirePermissionInSpace('canManageRota')
  async getDayHours(
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('spaceId') spaceId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.services.task.ask(getDayHours, {
      organizationId: callerOrgId(user),
      technicianId: id,
      scopeSpaceIds: leaveWriteScope(user),
      date: typeof date === 'string' ? date.slice(0, 10) : '',
      spaceId: typeof spaceId === 'string' ? spaceId : '',
    });
  }

  @Put(':id/day-hours')
  @ApiOperation({ summary: "Set one day's hours for a member (an approved changed-hours request)" })
  @ApiParam({ name: 'id', description: 'Member ID' })
  @RequirePermissionInSpace('canManageRota')
  async setDayHours(@Param('id') id: string, @Body() body: SetDayHoursDto, @CurrentUser() user: SessionUser) {
    return this.services.task.ask(setDayHours, {
      editorId: user.id,
      organizationId: callerOrgId(user),
      technicianId: id,
      scopeSpaceIds: leaveWriteScope(user),
      date: body.date,
      spaceId: body.spaceId ?? null,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      reason: body.reason ?? null,
    });
  }

  @Patch('time-off/:timeOffId')
  @ApiOperation({ summary: 'Admin: edit an existing day off (dates / reason)' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @RequirePermission('canManageRota')
  async updateTimeOff(
    @Param('timeOffId') timeOffId: string,
    @Body() body: UpdateTimeOffDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.services.task.ask(updateTimeOff, {
      organizationId: callerOrgId(user),
      timeOffId,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
    });
  }

  @Delete('time-off/:timeOffId/manage')
  @ApiOperation({ summary: 'Admin: delete a day off' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @RequirePermission('canManageRota')
  async adminDeleteTimeOff(@Param('timeOffId') timeOffId: string, @CurrentUser() user: SessionUser) {
    return this.services.task.ask(adminDeleteTimeOff, { organizationId: callerOrgId(user), timeOffId });
  }

  @Delete('time-off/:timeOffId')
  @ApiOperation({ summary: 'Cancel a time-off request' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @ApiResponse({ status: 200, description: 'Time-off request canceled' })
  @Roles(Role.EMPLOYEE)
  async cancelTimeOff(@Param('timeOffId') timeOffId: string, @CurrentUser() user: SessionUser) {
    return this.services.task.ask(cancelTimeOff, {
      timeOffId,
      technicianId: user.id,
    });
  }
}
