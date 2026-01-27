import {
  Controller,
  Get,
  Post,
  Put,
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
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { AttendanceService } from './attendance.service';
import { AttendanceQueueService } from './attendance.queue.service';
import { ClockInDto, ClockOutDto, StartBreakDto, EndBreakDto } from './dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceQueueService: AttendanceQueueService,
  ) {}

  @Post('clock-in')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Clock in at a company location' })
  async clockIn(@Body() dto: ClockInDto, @Request() req: any) {
    return this.attendanceQueueService.clockIn({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('clock-out')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Clock out from current shift' })
  async clockOut(@Body() dto: ClockOutDto, @Request() req: any) {
    return this.attendanceQueueService.clockOut({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('status')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get current clock-in status' })
  async getStatus(@Request() req: any) {
    return this.attendanceService.getStatus({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('history')
  @Roles(Role.TECHNICIAN)
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

  @Get('locations/:id/entries')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get time entries for a location (admin view)' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date in ISO format (defaults to today)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLocationEntries(
    @Param('id') locationId: string,
    @Query('date') date?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.attendanceService.getLocationEntries({
      locationId,
      organizationId: req.user.organizationId,
      date,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get all time entries for the organization' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date in ISO format (defaults to today)' })
  @ApiQuery({ name: 'status', required: false, enum: ['CLOCKED_IN', 'CLOCKED_OUT', 'AUTO_OUT'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllEntries(
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.attendanceService.getAllEntries({
      organizationId: req.user.organizationId,
      date,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // =========================================================================
  // REPORTS
  // =========================================================================

  @Get('reports/summary')
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.TECHNICIAN)
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
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'End current break' })
  async endBreak(@Body() dto: EndBreakDto, @Request() req: any) {
    return this.attendanceService.endBreak({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      notes: dto.notes,
    });
  }

  @Get('breaks/status')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get current break status' })
  async getBreakStatus(@Request() req: any) {
    return this.attendanceService.getBreakStatus({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('entries/:id/breaks')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get breaks for a specific time entry' })
  async getBreaksForEntry(@Param('id') timeEntryId: string, @Request() req: any) {
    return this.attendanceService.getBreaksForEntry({
      timeEntryId,
      organizationId: req.user.organizationId,
    });
  }

  @Get('breaks/active')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get all active breaks in the organization' })
  async getActiveBreaks(@Request() req: any) {
    return this.attendanceService.getActiveBreaks({
      organizationId: req.user.organizationId,
    });
  }

  @Get('breaks/history')
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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

  @Post('approvals/bulk-approve')
  @Roles(Role.ADMIN, Role.DISPATCHER)
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
