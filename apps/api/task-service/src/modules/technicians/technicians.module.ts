import { RequestPrecheckService } from './request-precheck.service';
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { PrismaModule, SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';
import { MemberPerformanceService } from './member-performance.service';
import { MemberScheduleService } from './member-schedule.service';
import { TimeOffRequestService } from './time-off-request.service';
import { LeaveRecordsService } from './leave-records.service';
import { TimeOffDecisionService } from './time-off-decision.service';
import { CoverService } from './cover.service';
import { LeaveLedgerService } from './leave-ledger.service';
import { LeaveCarryOverService } from './leave-carry-over.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { CalendarRulesModule } from '../calendar/calendar-rules.module';
import { LeaveOpeningService } from './leave-opening.service';
import { CoverFloorService } from './cover-floor.service';
import { DayHoursService } from './day-hours.service';

@Module({
  // NotificationRoutingService needs no import — NotificationRoutingModule is
  // @Global, deliberately, so one instance holds one recipient cache.
  imports: [
    AttendanceModule,
    CalendarRulesModule,
    PrismaModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [TechniciansController],
  providers: [
    TechniciansService,
    MemberPerformanceService,
    MemberScheduleService,
    TimeOffRequestService,
    LeaveRecordsService,
    TimeOffDecisionService,
    CoverService,
    CoverFloorService,
    LeaveLedgerService,
    LeaveOpeningService,
    LeaveCarryOverService,
    RequestPrecheckService,
    DayHoursService,
  ],
  exports: [TechniciansService, LeaveRecordsService, TimeOffDecisionService, CoverService, LeaveLedgerService],
})
export class TechniciansModule {}
