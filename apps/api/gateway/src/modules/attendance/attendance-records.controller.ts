import { Controller, Get, Patch, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role, clampListLimit, isNoShowExcuseReason } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AttendanceControllerBase } from './attendance-controller.base';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/** /attendance — the record: history, entries, who is clocked in, no-shows. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceRecordsController extends AttendanceControllerBase {
  @Get('history')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get own attendance history' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistory(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('page') page: number | undefined,
    @Query('limit') limit: number | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceService.getHistory({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      startDate,
      endDate,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('entries')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: "Today's entries for multiple spaces at once (member-scoped for non-admins)" })
  @ApiQuery({ name: 'ids', required: true, description: 'Comma-separated company-location IDs' })
  @ApiQuery({ name: 'date', required: false, type: String })
  async getLocationEntriesBatch(
    @Query('ids') ids: string,
    @Query('date') date: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceService.getLocationEntriesBatch({
      locationIds: (ids || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      organizationId: callerOrgId(req.user),
      date,
      requesterId: req.user.id,
      // Same rule as GET locations/:id/entries — the attendance permission
      // (org-wide, or in that space through an active assignment), never the
      // roster and never "view all tasks". The service narrows per space.
      viewScopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  @Get('locations/:id/entries')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get time entries for a location (admins, or members of that space)' })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'Single day (defaults to today) — ignored when startDate/endDate given',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Range start (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Range end (yyyy-MM-dd)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLocationEntries(
    @Param('id') locationId: string,
    @Query('date') date: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: number | undefined,
    @Query('limit') limit: number | undefined,
    @Query('sortBy') sortBy: string | undefined,
    @Query('sortOrder') sortOrder: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    // The service decides: org-wide canViewSpaceAttendance, or the permission
    // in THIS workspace through an assignment active now (External Supervisor
    // included, External Observer not). Being on the roster is not enough.
    return this.attendanceService.getLocationEntries({
      locationId,
      organizationId: callerOrgId(req.user),
      date,
      startDate,
      endDate,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy,
      sortOrder,
      requesterId: req.user.id,
      viewScopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      // Cross-org shared spaces whose owner enabled "show attendance".
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? []).filter((s) => s.showAttendance).map((s) => s.spaceId),
    });
  }

  // =========================================================================
  // ADMIN SCHEDULER ENDPOINTS
  // =========================================================================

  @Get('all-entries')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get all time entries for the organization' })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'Single day (defaults to today) — ignored when startDate/endDate given',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Range start (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Range end (yyyy-MM-dd)' })
  @ApiQuery({ name: 'status', required: false, enum: ['CLOCKED_IN', 'CLOCKED_OUT', 'AUTO_OUT'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllEntries(
    @Query('date') date: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: number | undefined,
    @Query('limit') limit: number | undefined,
    @Query('sortBy') sortBy: string | undefined,
    @Query('sortOrder') sortOrder: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    const parsedPage = page ? Math.max(1, Number(page) || 1) : 1;
    const parsedLimit = clampListLimit(limit, 20, 500);
    return this.attendanceService.getAllEntries({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      date,
      startDate,
      endDate,
      status,
      search,
      page: parsedPage,
      limit: parsedLimit,
      sortBy,
      sortOrder,
    });
  }

  @Get('active-entries')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Who is clocked in right now (org-wide, date-independent)' })
  async getActiveEntries(@Request() req: AuthedRequest) {
    return this.attendanceService.getActiveEntries({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  @Get('no-shows')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({
    summary: 'Recent no-shows (scheduled shift, no clock-in); open=true → only the undecided, with their run and facts',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'spaceId', required: false, type: String })
  @ApiQuery({ name: 'open', required: false, type: Boolean })
  async listNoShows(
    @Query('days') days: number | undefined,
    @Query('spaceId') spaceId: string | undefined,
    @Request() req: AuthedRequest,
    @Query('open') open?: string,
  ) {
    return this.attendanceService.listNoShows({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      days: days ? Math.min(Math.max(1, Number(days) || 7), 60) : 7,
      spaceId: spaceId || undefined,
      open: open === 'true' || open === '1',
    });
  }

  @Get('no-shows/summary')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({
    summary: 'The no-show record: one row per person — last planned days, absent / excused / settled / open',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'spaceId', required: false, type: String })
  async noShowSummary(
    @Query('days') days: number | undefined,
    @Query('spaceId') spaceId: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceService.noShowSummary({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      days: days ? Math.min(Math.max(1, Number(days) || 30), 90) : 30,
      spaceId: spaceId || undefined,
    });
  }

  @Patch('no-shows/:id')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({
    summary: 'Decide a no-show: excused (with what happened), absent, or reopen — one day or its whole run',
  })
  async resolveNoShow(
    @Param('id') id: string,
    @Body() body: { action: 'excuse' | 'absent' | 'reopen'; reasonCode?: string; reason?: string; wholeRun?: boolean },
    @Request() req: AuthedRequest,
  ) {
    const action = body?.action === 'reopen' || body?.action === 'absent' ? body.action : 'excuse';
    return this.attendanceService.resolveNoShow({
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canReconcileAttendance'),
      action,
      reasonCode: isNoShowExcuseReason(body?.reasonCode) ? body.reasonCode : undefined,
      reason: typeof body?.reason === 'string' ? body.reason.slice(0, 500) : undefined,
      wholeRun: body?.wholeRun === true,
      excusedById: req.user.id,
    });
  }
}
