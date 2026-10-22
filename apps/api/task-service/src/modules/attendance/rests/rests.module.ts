import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { BreakStartService } from './break-start.service';
import { BreakService } from './break.service';
import { BreakStatusService } from './break-status.service';
import { BreakReadService } from './break-read.service';
import { OfficeBreaksService } from './office-breaks.service';
import { RestAwayService } from './rest-away.service';
import { BreakReminderService } from './break-reminder.service';
import { BreaksRpcController } from './breaks.rpc.controller';

/**
 * Rests: starting and ending one, the office's corrections, lunch off site, the reminders.
 */
@Module({
  imports: [AttendanceCoreModule, ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [BreaksRpcController],
  providers: [
    BreakStartService,
    BreakService,
    BreakStatusService,
    BreakReadService,
    OfficeBreaksService,
    RestAwayService,
    BreakReminderService,
  ],
  exports: [
    BreakStartService,
    BreakService,
    BreakStatusService,
    BreakReadService,
    OfficeBreaksService,
    RestAwayService,
    BreakReminderService,
  ],
})
export class RestsModule {}
