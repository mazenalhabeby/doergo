import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { AttendanceShiftsModule } from '../shifts/attendance-shifts.module';
import { NoShowsModule } from '../no-shows/no-shows.module';
import { HandoverModule } from '../../tasks/handover/handover.module';
import { ClockOutModule } from '../clock-out/clock-out.module';
import { ApprovalService } from './approval.service';
import { EntryEditService } from './entry-edit.service';
import { EntryRecordService } from './entry-record.service';
import { ManualEntriesService } from './manual-entries.service';
import { ENTRY_SERVICES } from './entry-services';
import { EntryDecisionsRpcController } from './entry-decisions.rpc.controller';

/**
 * Time entries as records the office decides: approve, edit, add by hand, and each entry's history.
 */
@Module({
  imports: [
    AttendanceCoreModule,
    AttendanceShiftsModule,
    NoShowsModule,
    HandoverModule,
    // The office closing a running shift uses THE close (clock review B9).
    ClockOutModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [EntryDecisionsRpcController],
  providers: ENTRY_SERVICES,
  exports: [ApprovalService, EntryEditService, EntryRecordService, ManualEntriesService],
})
export class AttendanceEntriesModule {}
