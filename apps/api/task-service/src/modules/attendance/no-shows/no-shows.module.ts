import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { CalendarRulesModule } from '../../calendar/calendar-rules.module';
import { NoShowSettleService } from './no-show-settle.service';
import { NoShowRecordService } from './no-show-record.service';
import { NoShowSummaryService } from './no-show-summary.service';
import { ShiftSweepService } from './shift-sweep.service';

/**
 * A no-show: the minute sweep that notices one, what the system closes itself, the record and its summary.
 */
@Module({
  imports: [
    AttendanceCoreModule,
    CalendarRulesModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [NoShowSettleService, NoShowRecordService, NoShowSummaryService, ShiftSweepService],
  exports: [NoShowSettleService, NoShowRecordService, NoShowSummaryService, ShiftSweepService],
})
export class NoShowsModule {}
