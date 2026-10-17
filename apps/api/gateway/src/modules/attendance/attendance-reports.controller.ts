import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AttendanceControllerBase } from './attendance-controller.base';

/** /attendance/reports — summary, week, month, CSV export. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceReportsController extends AttendanceControllerBase {
  // =========================================================================
  // REPORTS
  // =========================================================================

  @Get('reports/summary')
  @RequirePermissionInSpace('canViewSpaceAttendance')
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
    return this.attendanceReports.getAttendanceSummary({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      userId,
      startDate,
      endDate,
    });
  }

  @Get('reports/weekly')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get weekly attendance report' })
  @ApiQuery({ name: 'weekStartDate', required: false, type: String, description: 'Week start date (defaults to current week)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getWeeklyReport(
    @Query('weekStartDate') weekStartDate?: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceReports.getWeeklyReport({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
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
    @Query('year') year?: number,
    @Query('month') month?: number,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceReports.getMonthlyReport({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
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
  async exportToCSV(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceReports.exportToCSV({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      startDate,
      endDate,
      userId,
    });
  }
}
