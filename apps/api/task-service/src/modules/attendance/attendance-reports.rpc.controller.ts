import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttendanceReportService } from './attendance-report.service';

/** Attendance reports over RPC: summary, week, month, CSV. */
@Controller()
export class AttendanceReportsRpcController {
  constructor(private readonly reportService: AttendanceReportService) {}

  // =========================================================================
  // REPORTS
  // =========================================================================

  @MessagePattern({ cmd: 'get_attendance_summary' })
  async getAttendanceSummary(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      userId?: string;
      startDate: string;
      endDate: string;
    },
  ) {
    return this.reportService.getAttendanceSummary(data);
  }

  @MessagePattern({ cmd: 'get_weekly_report' })
  async getWeeklyReport(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      userId?: string;
      weekStartDate?: string;
    },
  ) {
    return this.reportService.getWeeklyReport(data);
  }

  @MessagePattern({ cmd: 'get_monthly_report' })
  async getMonthlyReport(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      userId?: string;
      year?: number;
      month?: number;
    },
  ) {
    return this.reportService.getMonthlyReport(data);
  }

  @MessagePattern({ cmd: 'export_attendance_csv' })
  async exportToCSV(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      startDate: string;
      endDate: string;
      userId?: string;
    },
  ) {
    return this.reportService.exportToCSV(data);
  }
}
