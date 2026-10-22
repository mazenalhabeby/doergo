import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { HandoverModule } from '../handover/handover.module';
import { DepartureReminderService } from './departure-reminder.service';
import { LeaderAbsentService } from './leader-absent.service';

/**
 * The tasks module's timed sweeps: when to set off (departure), and a job whose leader is off today.
 */
@Module({
  imports: [HandoverModule, ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [DepartureReminderService, LeaderAbsentService],
  exports: [DepartureReminderService, LeaderAbsentService],
})
export class TaskSweepsModule {}
