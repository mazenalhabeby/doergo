import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DayRangeQueryDto } from './dto/day-range.dto';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AttendanceReportsGatewayService } from './attendance-reports.gateway-service';
import { scopeFor } from '../../common/permission-scope';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/** /attendance/reports — summary, week, month, CSV export. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceReportsController {
  constructor(private readonly attendanceReports: AttendanceReportsGatewayService) {}

  // =========================================================================
  // REPORTS
  // =========================================================================

  @Get('reports/summary')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get attendance summary for a date range' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getAttendanceSummary(@Query() q: DayRangeQueryDto, @Request() req: AuthedRequest) {
    const { startDate, endDate, userId } = q;
    return this.attendanceReports.getAttendanceSummary({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
      userId,
      startDate,
      endDate,
    });
  }

  @Get('reports/weekly')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get weekly attendance report' })
  @ApiQuery({
    name: 'weekStartDate',
    required: false,
    type: String,
    description: 'Week start date (defaults to current week)',
  })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getWeeklyReport(
    @Query('weekStartDate') weekStartDate: string | undefined,
    @Query('userId') userId: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceReports.getWeeklyReport({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
      userId,
      weekStartDate,
    });
  }

  @Get('reports/monthly')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get monthly attendance report' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Year (defaults to current)' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Month 1-12 (defaults to current)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getMonthlyReport(
    @Query('year') year: number | undefined,
    @Query('month') month: number | undefined,
    @Query('userId') userId: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceReports.getMonthlyReport({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
      userId,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Get('reports/export')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Export attendance data to CSV' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async exportToCSV(@Query() q: DayRangeQueryDto, @Request() req: AuthedRequest) {
    const { startDate, endDate, userId } = q;
    return this.attendanceReports.exportToCSV({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
      startDate,
      endDate,
      userId,
    });
  }
}
