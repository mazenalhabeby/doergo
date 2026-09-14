import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ShiftResolverService } from './shift-resolver.service';
import { BreakService } from './break.service';
import { AttendanceReportService } from './attendance-report.service';
import { ApprovalService } from './approval.service';
import { AttendanceProcessor } from './attendance.processor';
import { AttendanceScheduler } from './attendance.scheduler';
import { CountedTimeService } from './counted-time.service';
import { BreakRulesService } from './break-rules.service';
import { BreakReminderService } from './break-reminder.service';
import { PresenceModule } from './presence/presence.module';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.ATTENDANCE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.OVERTIME }),
    PresenceModule,
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    ShiftResolverService,
    // One answer to "what are these hours worth", shared by the clock-out, the
    // self-reported clock-out, the admin edit and the break services.
    CountedTimeService,
    // Rests: the rules a workspace writes, and one shift's plan of them.
    BreakRulesService,
    BreakReminderService,
    BreakService,
    AttendanceReportService,
    ApprovalService,
    AttendanceProcessor,
    AttendanceScheduler,
  ],
  exports: [AttendanceService, AttendanceScheduler],
})
export class AttendanceModule {}
