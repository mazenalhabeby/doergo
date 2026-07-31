import {
  Controller,
  Get,
  Post,
  Put,
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
    });
  }

  // =========================================================================
  // ADMIN SCHEDULER ENDPOINTS
  // =========================================================================

  @Get('scheduler/info')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get scheduler info (repeatable jobs and queue stats)' })
  async getSchedulerInfo() {
    return this.attendanceQueueService.getSchedulerInfo();
  }

  @Post('scheduler/trigger')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Manually trigger auto clock-out' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['hourly', 'midnight'],
    description: 'Type of auto clock-out (default: hourly)',
  })
  async triggerAutoClockOut(@Query('type') type: 'hourly' | 'midnight' = 'hourly') {
    return this.attendanceQueueService.autoClockOut(type);
  }

  @Get('all-entries')
  @RequirePermission('canViewAllTasks')
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

  // =========================================================================
  // REPORTS
  // =========================================================================

  @Get('reports/summary')
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get all active breaks in the organization' })
  async getActiveBreaks(@Request() req: any) {
    return this.attendanceService.getActiveBreaks({
      organizationId: req.user.organizationId,
    });
  }

  @Get('breaks/history')
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canManageUsers')
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canManageUsers')
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
  @RequirePermission('canManageUsers')
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

  @Put('entries/:id/edit')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Edit a time entry (manager correction)' })
  async editEntry(
    @Param('id') entryId: string,
    @Body() body: {
      clockInAt?: string;
      clockOutAt?: string;
      notes?: string;
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
      reason: body.reason,
    });
  }

  @Delete('entries/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a time entry (admin)' })
  async deleteEntry(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.deleteEntry({
      entryId,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('entries/manual')
  @RequirePermission('canManageUsers')
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
  @RequirePermission('canManageUsers')
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
