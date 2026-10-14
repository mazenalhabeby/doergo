import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ATTENDANCE_SERVICE_PARTS } from './attendance-service-parts';
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
import { ShiftRematchService } from './shift-rematch.service';
import { ClockOutService } from './clock-out.service';
import { NoShowSettleService } from './no-show-settle.service';
import { HandoverModule } from '../tasks/handover/handover.module';
import { CalendarRulesModule } from '../calendar/calendar-rules.module';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.ATTENDANCE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.OVERTIME }),
    PresenceModule,
    // Every way a shift ends pauses the jobs left in work.
    HandoverModule,
    // Public holidays close a missed shift by themselves (no-show-settle).
    CalendarRulesModule,
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    ...ATTENDANCE_SERVICE_PARTS, // the collaborators behind the AttendanceService facade
    ShiftResolverService,
    // One answer to "what are these hours worth", shared by the clock-out, the
    // self-reported clock-out, the admin edit and the break services.
    CountedTimeService,
    // Rests: the rules a workspace writes, and one shift's plan of them.
    BreakRulesService,
    BreakReminderService,
    BreakService,
    // A shift added after the clock-in reaches the entries it covers.
    ShiftRematchService,
    AttendanceReportService,
    ApprovalService,
    AttendanceProcessor,
    AttendanceScheduler,
  ],
  // ClockOutService: the one way a shift closes — the legacy overtime module closes through it too.
  exports: [AttendanceService, AttendanceScheduler, ShiftRematchService, ClockOutService, NoShowSettleService],
})
export class AttendanceModule {}
