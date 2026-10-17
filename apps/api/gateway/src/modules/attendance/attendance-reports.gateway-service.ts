import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  getAttendanceSummary,
  getWeeklyReport,
  getMonthlyReport,
  exportAttendanceCsv,
} from '@hbcfield/shared/microservices';

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
  async getAttendanceSummary(data: RpcRequest<typeof getAttendanceSummary>) {
    return this.send(pattern(getAttendanceSummary), data);
  }

  /**
   * Get weekly attendance report
   */
  async getWeeklyReport(data: RpcRequest<typeof getWeeklyReport>) {
    return this.send(pattern(getWeeklyReport), data);
  }

  /**
   * Get monthly attendance report
   */
  async getMonthlyReport(data: RpcRequest<typeof getMonthlyReport>) {
    return this.send(pattern(getMonthlyReport), data);
  }

  /**
   * Export attendance data to CSV
   */
  async exportToCSV(data: RpcRequest<typeof exportAttendanceCsv>) {
    return this.send(pattern(exportAttendanceCsv), data);
  }
}
