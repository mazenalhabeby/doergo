import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Attendance reports, asked of task-service: summary, week, month, CSV. */
@Injectable()
export class AttendanceReportsGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, AttendanceReportsGatewayService.name);
  }

  // =========================================================================
  // REPORTS
  // =========================================================================

  /**
   * Get attendance summary for a period
   */
  async getAttendanceSummary(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    userId?: string;
    startDate: string;
    endDate: string;
  }) {
    return this.send({ cmd: 'get_attendance_summary' }, data);
  }

  /**
   * Get weekly attendance report
   */
  async getWeeklyReport(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    userId?: string;
    weekStartDate?: string;
  }) {
    return this.send({ cmd: 'get_weekly_report' }, data);
  }

  /**
   * Get monthly attendance report
   */
  async getMonthlyReport(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    userId?: string;
    year?: number;
    month?: number;
  }) {
    return this.send({ cmd: 'get_monthly_report' }, data);
  }

  /**
   * Export attendance data to CSV
   */
  async exportToCSV(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    return this.send({ cmd: 'export_attendance_csv' }, data);
  }
}
