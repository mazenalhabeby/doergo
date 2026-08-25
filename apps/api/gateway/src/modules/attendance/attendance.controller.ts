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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { AttendanceService } from './attendance.service';
import { AttendanceQueueService } from './attendance.queue.service';
import { ClockInDto, ClockOutDto, HeartbeatDto, StartBreakDto, EndBreakDto } from './dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceQueueService: AttendanceQueueService,
  ) {}

  @Post('clock-in')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Clock in at a company location' })
  async clockIn(@Body() dto: ClockInDto, @Request() req: any) {
    return this.attendanceQueueService.clockIn({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('clock-out')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Clock out from current shift' })
  async clockOut(@Body() dto: ClockOutDto, @Request() req: any) {
    return this.attendanceQueueService.clockOut({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('heartbeat')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Send location heartbeat while clocked in' })
  async heartbeat(@Body() dto: HeartbeatDto, @Request() req: any) {
    return this.attendanceQueueService.heartbeat({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('status')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get current clock-in status' })
  async getStatus(@Request() req: any) {
    return this.attendanceService.getStatus({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  // ── Session work-log ("what I did today") ──────────────────────────────────
  // Ownership is enforced in the service (a member manages their OWN session's
  // log; managers with canManage may view/manage any session in their org).
  private canManage(req: any): boolean {
    return !!(req.user?.canManageUsers || req.user?.canViewAllTasks);
  }

  @Post('entries/:entryId/worklog')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Add a work-log note to an attendance session' })
  async worklogAdd(@Param('entryId') entryId: string, @Body() body: { body: string; at?: string; taskId?: string }, @Request() req: any) {
    return this.attendanceService.worklogAddNote({
      organizationId: req.user.organizationId, callerUserId: req.user.id, canManage: this.canManage(req),
      timeEntryId: entryId, body: body?.body, at: body?.at, taskId: body?.taskId,
    });
  }

  @Post('entries/:entryId/worklog/batch')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Batch-add work-log notes (offline flush)' })
  async worklogBatch(@Param('entryId') entryId: string, @Body() body: { notes: any[] }, @Request() req: any) {
    return this.attendanceService.worklogAddNotesBatch({
      organizationId: req.user.organizationId, callerUserId: req.user.id, canManage: this.canManage(req),
      timeEntryId: entryId, notes: body?.notes ?? [],
    });
  }

  @Get('entries/:entryId/worklog')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: "An attendance session's work-log (notes + photos)" })
  async worklogList(@Param('entryId') entryId: string, @Request() req: any) {
    return this.attendanceService.worklogList({
      organizationId: req.user.organizationId, callerUserId: req.user.id, canManage: this.canManage(req),
      timeEntryId: entryId,
    });
  }

  @Delete('worklog/:noteId')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Delete a work-log note' })
  async worklogDelete(@Param('noteId') noteId: string, @Request() req: any) {
    return this.attendanceService.worklogDeleteNote({
      organizationId: req.user.organizationId, callerUserId: req.user.id, canManage: this.canManage(req), noteId,
    });
  }

  @Post('worklog/:noteId/attachments/presign')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Presigned upload URL for a work-log photo/file' })
  async worklogPresign(@Param('noteId') noteId: string, @Body() body: { fileName: string; mimeType: string }, @Request() req: any) {
    return this.attendanceService.worklogPresignAttachment({
      organizationId: req.user.organizationId, callerUserId: req.user.id, canManage: this.canManage(req),
      noteId, fileName: body?.fileName, mimeType: body?.mimeType,
    });
  }

  @Post('worklog/:noteId/attachments')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Confirm a work-log photo/file upload' })
  async worklogConfirm(@Param('noteId') noteId: string, @Body() body: any, @Request() req: any) {
    return this.attendanceService.worklogConfirmAttachment({
      organizationId: req.user.organizationId, callerUserId: req.user.id, canManage: this.canManage(req),
      noteId, fileKey: body?.fileKey, fileUrl: body?.fileUrl, fileName: body?.fileName,
      fileSize: body?.fileSize, mimeType: body?.mimeType, width: body?.width, height: body?.height,
    });
  }

  @Delete('worklog/attachments/:attachmentId')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Delete a work-log attachment' })
  async worklogDeleteAttachment(@Param('attachmentId') attachmentId: string, @Request() req: any) {
    return this.attendanceService.worklogDeleteAttachment({
      organizationId: req.user.organizationId, callerUserId: req.user.id, canManage: this.canManage(req), attachmentId,
    });
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get own attendance history' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistory(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.attendanceService.getHistory({
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
    @Query('date') date?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getLocationEntriesBatch({
      locationIds: (ids || '').split(',').map((s) => s.trim()).filter(Boolean),
      organizationId: req.user.organizationId,
      date,
      requesterId: req.user.id,
      requesterCanViewAll: !!req.user.canViewAllTasks,
    });
  }

  @Get('locations/:id/entries')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get time entries for a location (admins, or members of that space)' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Single day (defaults to today) — ignored when startDate/endDate given' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Range start (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Range end (yyyy-MM-dd)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLocationEntries(
    @Param('id') locationId: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Request() req?: any,
  ) {
    // Full-access roles see any location; otherwise the service verifies the
    // requester is a roster member of the space.
    return this.attendanceService.getLocationEntries({
      locationId,
      organizationId: req.user.organizationId,
      date,
      startDate,
      endDate,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy,
      sortOrder,
      requesterId: req.user.id,
      requesterCanViewAll: !!req.user.canViewAllTasks,
      // Cross-org shared spaces whose owner enabled "show attendance".
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? [])
        .filter((s: any) => s.showAttendance)
        .map((s: any) => s.spaceId),
    });
  }

  // =========================================================================
  // ADMIN SCHEDULER ENDPOINTS
  // =========================================================================

  @Get('all-entries')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get all time entries for the organization' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Single day (defaults to today) — ignored when startDate/endDate given' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Range start (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Range end (yyyy-MM-dd)' })
  @ApiQuery({ name: 'status', required: false, enum: ['CLOCKED_IN', 'CLOCKED_OUT', 'AUTO_OUT'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllEntries(
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Request() req?: any,
  ) {
    const parsedPage = page ? Math.max(1, Number(page) || 1) : 1;
    const parsedLimit = Math.min(limit ? Math.max(1, Number(limit) || 20) : 20, 500);
    return this.attendanceService.getAllEntries({
      organizationId: req.user.organizationId,
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
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Who is clocked in right now (org-wide, date-independent)' })
  async getActiveEntries(@Request() req: any) {
    return this.attendanceService.getActiveEntries({
      organizationId: req.user.organizationId,
    });
  }

  @Get('no-shows')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Recent no-shows (scheduled shift, no clock-in) for review' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'spaceId', required: false, type: String })
  async listNoShows(@Query('days') days?: number, @Query('spaceId') spaceId?: string, @Request() req?: any) {
    return this.attendanceService.listNoShows({
      organizationId: req.user.organizationId,
      days: days ? Math.min(Math.max(1, Number(days) || 7), 60) : 7,
      spaceId: spaceId || undefined,
    });
  }

  @Patch('no-shows/:id')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Excuse or reopen a no-show' })
  async resolveNoShow(
    @Param('id') id: string,
    @Body() body: { action: 'excuse' | 'reopen'; reason?: string },
    @Request() req: any,
  ) {
    return this.attendanceService.resolveNoShow({
      id,
      organizationId: req.user.organizationId,
      action: body?.action === 'reopen' ? 'reopen' : 'excuse',
      reason: body?.reason,
      excusedById: req.user.id,
    });
  }

  // =========================================================================
  // REPORTS
  // =========================================================================

  @Get('reports/summary')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get attendance summary for a date range' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getAttendanceSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getAttendanceSummary({
      organizationId: req.user.organizationId,
      userId,
      startDate,
      endDate,
    });
  }

  @Get('reports/weekly')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get weekly attendance report' })
  @ApiQuery({ name: 'weekStartDate', required: false, type: String, description: 'Week start date (defaults to current week)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getWeeklyReport(
    @Query('weekStartDate') weekStartDate?: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getWeeklyReport({
      organizationId: req.user.organizationId,
      userId,
      weekStartDate,
    });
  }

  @Get('reports/monthly')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get monthly attendance report' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Year (defaults to current)' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Month 1-12 (defaults to current)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getMonthlyReport(
    @Query('year') year?: number,
    @Query('month') month?: number,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getMonthlyReport({
      organizationId: req.user.organizationId,
      userId,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Get('reports/export')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Export attendance data to CSV' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async exportToCSV(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.exportToCSV({
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      userId,
    });
  }

  // =========================================================================
  // BREAKS
  // =========================================================================

  @Post('breaks/start')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Start a break during current shift' })
  async startBreak(@Body() dto: StartBreakDto, @Request() req: any) {
    return this.attendanceService.startBreak({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      type: dto.type,
      notes: dto.notes,
    });
  }

  @Post('breaks/end')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'End current break' })
  async endBreak(@Body() dto: EndBreakDto, @Request() req: any) {
    return this.attendanceService.endBreak({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      notes: dto.notes,
    });
  }

  @Get('breaks/status')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get current break status' })
  async getBreakStatus(@Request() req: any) {
    return this.attendanceService.getBreakStatus({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('entries/:id/breaks')
  @ApiOperation({ summary: 'Get breaks for a specific time entry' })
  async getBreaksForEntry(@Param('id') timeEntryId: string, @Request() req: any) {
    return this.attendanceService.getBreaksForEntry({
      timeEntryId,
      organizationId: req.user.organizationId,
    });
  }

  @Get('breaks/active')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get all active breaks in the organization' })
  async getActiveBreaks(@Request() req: any) {
    return this.attendanceService.getActiveBreaks({
      organizationId: req.user.organizationId,
    });
  }

  @Get('breaks/history')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get break history with filters' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, enum: ['LUNCH', 'SHORT', 'OTHER'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getBreakHistory(
    @Query('date') date?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.attendanceService.getBreakHistory({
      organizationId: req.user.organizationId,
      date,
      userId,
      type,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('breaks/:id/end')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'End a break manually (manager action)' })
  async endBreakManually(
    @Param('id') breakId: string,
    @Body() body?: { notes?: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.endBreakManually({
      breakId,
      adminId: req.user.id,
      organizationId: req.user.organizationId,
      notes: body?.notes,
    });
  }

  @Get('breaks/summary')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get break summary statistics' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  async getBreakSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getBreakSummary({
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      userId,
    });
  }

  // =========================================================================
  // APPROVAL WORKFLOW
  // =========================================================================

  @Get('approvals/pending')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get time entries pending approval' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPendingApprovals(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.attendanceService.getPendingApprovals({
      organizationId: req.user.organizationId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('approvals/:id/approve')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Approve a time entry' })
  async approveEntry(
    @Param('id') entryId: string,
    @Body() body?: { notes?: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.approveEntry({
      entryId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      notes: body?.notes,
    });
  }

  @Post('approvals/:id/reject')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Reject a time entry' })
  async rejectEntry(
    @Param('id') entryId: string,
    @Body() body: { reason: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.rejectEntry({
      entryId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      reason: body.reason,
    });
  }

  // ── Geofence excursion ("out of ring") ────────────────────────────────────

  @Post('excursions/report')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Report a reason + duration for being outside the ring' })
  async reportExcursion(
    @Body() body: { reason: string; requestedMinutes: number },
    @Request() req?: any,
  ) {
    return this.attendanceService.reportExcursion({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      reason: body?.reason,
      requestedMinutes: Number(body?.requestedMinutes),
    });
  }

  @Get('excursions')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'List active out-of-ring requests (approver surface)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'pending', 'approved'] })
  async listExcursions(
    @Query('status') status?: 'active' | 'pending' | 'approved',
    @Request() req?: any,
  ) {
    return this.attendanceService.listExcursions({
      organizationId: req.user.organizationId,
      status,
    });
  }

  @Patch('excursions/:id/approve')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Approve an out-of-ring request (optionally adjust the granted time)' })
  async approveExcursion(
    @Param('id') excursionId: string,
    @Body() body?: { grantedMinutes?: number },
    @Request() req?: any,
  ) {
    return this.attendanceService.approveExcursion({
      excursionId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      grantedMinutes:
        body?.grantedMinutes != null ? Number(body.grantedMinutes) : undefined,
    });
  }

  @Patch('excursions/:id/reject')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Reject an out-of-ring request (clocks the worker out)' })
  async rejectExcursion(@Param('id') excursionId: string, @Request() req?: any) {
    return this.attendanceService.rejectExcursion({
      excursionId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  // ── Shift reminder responses ──────────────────────────────────────────────

  @Post('entries/:id/forgot-clock-out')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Resolve a forgotten clock-out with a self-reported leave time' })
  async resolveForgotClockOut(
    @Param('id') entryId: string,
    @Body() body: { clockOutAt: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.resolveForgotClockOut({
      entryId,
      clockOutAt: body.clockOutAt,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('entries/:id/request-extra-time')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Request to keep working past the shift end (routes to a leader)' })
  async requestExtraTime(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.requestExtraTime({
      entryId,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('extra-time/pending')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'List open extra-time requests the caller can approve' })
  async getPendingExtraTime(@Request() req?: any) {
    return this.attendanceService.listPendingExtraTime({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      // Org admins/managers see all; the space-role check runs server-side.
      isAdmin: req.user.role === Role.ADMIN || !!req.user.canManageUsers,
    });
  }

  // Leader actions: gated to authenticated staff; the real space-role permission
  // (canApproveOvertime) is enforced server-side in task-service.
  @Post('extra-time/:id/approve')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Approve N more minutes of overtime for an open shift' })
  async approveExtraTime(
    @Param('id') entryId: string,
    @Body() body: { minutes: number },
    @Request() req?: any,
  ) {
    return this.attendanceService.approveExtraTime({
      entryId,
      minutes: body.minutes,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('extra-time/:id/reject')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Reject an extra-time request' })
  async rejectExtraTime(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.rejectExtraTime({
      entryId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Put('entries/:id/edit')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Edit a time entry (manager correction)' })
  async editEntry(
    @Param('id') entryId: string,
    @Body() body: {
      clockInAt?: string;
      clockOutAt?: string;
      notes?: string;
      timezone?: string;
      reason: string;
    },
    @Request() req?: any,
  ) {
    return this.attendanceService.editEntry({
      entryId,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
      clockInAt: body.clockInAt,
      clockOutAt: body.clockOutAt,
      notes: body.notes,
      timezone: body.timezone,
      reason: body.reason,
    });
  }

  @Get('entries/:id/history')
  @RequirePermission('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get the full edit history for a time entry' })
  async getEntryHistory(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.getEntryHistory({
      entryId,
      organizationId: req.user.organizationId,
    });
  }

  @Delete('entries/:id')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Delete a time entry (admin)' })
  async deleteEntry(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.deleteEntry({
      entryId,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('entries/manual')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({
    summary:
      'Admin: add/back-date attendance for an employee (single day, or a weekday-filtered date-range backfill)',
  })
  async addManualEntries(
    @Body()
    body: {
      userId: string;
      locationId: string;
      startDate: string;
      endDate: string;
      weekdays?: number[];
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      notes?: string;
      reason?: string;
    },
    @Request() req?: any,
  ) {
    return this.attendanceService.addManualEntries({
      userId: body.userId,
      locationId: body.locationId,
      startDate: body.startDate,
      endDate: body.endDate,
      weekdays: body.weekdays,
      startTime: body.startTime,
      endTime: body.endTime,
      breakMinutes: body.breakMinutes,
      notes: body.notes,
      reason: body.reason,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('approvals/bulk-approve')
  @RequirePermission('canReconcileAttendance')
  @ApiOperation({ summary: 'Bulk approve multiple time entries' })
  async bulkApprove(
    @Body() body: { entryIds: string[]; notes?: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.bulkApprove({
      entryIds: body.entryIds,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      notes: body.notes,
    });
  }
}
