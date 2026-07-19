import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { BreakService } from './break.service';
import { AttendanceReportService } from './attendance-report.service';
import { ApprovalService } from './approval.service';
import { AttendanceProcessor } from './attendance.processor';
import { AttendanceScheduler } from './attendance.scheduler';
import { NotificationRoutingService } from '../../common/notification-routing.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.ATTENDANCE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.OVERTIME }),
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    BreakService,
    AttendanceReportService,
    ApprovalService,
    AttendanceProcessor,
    AttendanceScheduler,
    NotificationRoutingService,
  ],
  exports: [AttendanceService, AttendanceScheduler],
})
export class AttendanceModule {}
