import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttendanceReportService } from './attendance-report.service';
import {
  pattern,
  type RpcRequest,
  getAttendanceSummary,
  getWeeklyReport,
  getMonthlyReport,
  exportAttendanceCsv,
} from '@hbcfield/shared/microservices';

/** Attendance reports over RPC: summary, week, month, CSV. */
@Controller()
export class AttendanceReportsRpcController {
  constructor(private readonly reportService: AttendanceReportService) {}

  // =========================================================================
  // REPORTS
  // =========================================================================

  @MessagePattern(pattern(getAttendanceSummary))
  async getAttendanceSummary(
    @Payload()
    data: RpcRequest<typeof getAttendanceSummary>,
  ) {
    return this.reportService.getAttendanceSummary(data);
  }

  @MessagePattern(pattern(getWeeklyReport))
  async getWeeklyReport(
    @Payload()
    data: RpcRequest<typeof getWeeklyReport>,
  ) {
    return this.reportService.getWeeklyReport(data);
  }

  @MessagePattern(pattern(getMonthlyReport))
  async getMonthlyReport(
    @Payload()
    data: RpcRequest<typeof getMonthlyReport>,
  ) {
    return this.reportService.getMonthlyReport(data);
  }

  @MessagePattern(pattern(exportAttendanceCsv))
  async exportToCSV(
    @Payload()
    data: RpcRequest<typeof exportAttendanceCsv>,
  ) {
    return this.reportService.exportToCSV(data);
  }
}
