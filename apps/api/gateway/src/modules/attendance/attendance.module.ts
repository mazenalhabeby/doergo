import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import {
  QUEUE_NAMES,
} from '@hbcfield/shared';
import { AttendanceController } from './attendance.controller';
import { WorklogController } from './worklog.controller';
import { AttendanceRecordsController } from './attendance-records.controller';
import { AttendanceReportsController } from './attendance-reports.controller';
import { BreaksController } from './breaks.controller';
import { AttendanceApprovalsController } from './attendance-approvals.controller';
import { ExtraTimeController } from './extra-time.controller';
import { EntryEditsController } from './entry-edits.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceReportsGatewayService } from './attendance-reports.gateway-service';
import { BreaksGatewayService } from './breaks.gateway-service';
import { EntryDecisionsGatewayService } from './entry-decisions.gateway-service';
import { ExtraTimeGatewayService } from './extra-time.gateway-service';
import { AttendanceQueueService } from './attendance.queue.service';

@Module({
  imports: [
    // Microservice client for READ operations
    // BullMQ queue for WRITE operations
    BullModule.registerQueue({ name: QUEUE_NAMES.ATTENDANCE }),
    // Bull Board for monitoring
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.ATTENDANCE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [
    AttendanceController,
    WorklogController,
    AttendanceRecordsController,
    AttendanceReportsController,
    BreaksController,
    AttendanceApprovalsController,
    ExtraTimeController,
    EntryEditsController,
  ],
  providers: [
    AttendanceService,
    AttendanceReportsGatewayService,
    BreaksGatewayService,
    EntryDecisionsGatewayService,
    ExtraTimeGatewayService,
    AttendanceQueueService,
  ],
})
export class AttendanceModule {}
