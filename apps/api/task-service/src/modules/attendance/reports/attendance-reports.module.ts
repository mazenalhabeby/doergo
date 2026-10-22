import { Module } from '@nestjs/common';
import { AttendanceReportService } from './attendance-report.service';
import { AttendanceReportsRpcController } from './attendance-reports.rpc.controller';

/**
 * Attendance reports and exports.
 */
@Module({
  controllers: [AttendanceReportsRpcController],
  providers: [AttendanceReportService],
  exports: [AttendanceReportService],
})
export class AttendanceReportsModule {}
