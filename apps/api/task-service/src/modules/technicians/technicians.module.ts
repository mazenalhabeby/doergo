import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { PrismaModule, SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';
import { CoverService } from './cover.service';
import { LeaveLedgerService } from './leave-ledger.service';
import { LeaveCarryOverService } from './leave-carry-over.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { CalendarRulesModule } from '../calendar/calendar-rules.module';

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
  providers: [TechniciansService, CoverService, LeaveLedgerService, LeaveCarryOverService],
  exports: [TechniciansService, CoverService, LeaveLedgerService],
})
export class TechniciansModule {}
