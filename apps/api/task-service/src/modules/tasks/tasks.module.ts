import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { DepartureReminderService } from './departure-reminder.service';
import { TasksProcessor } from './tasks.processor';
import { AttachmentsModule } from '../attachments/attachments.module';

import { PresenceModule } from '../attendance/presence/presence.module';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    AttachmentsModule,
    PresenceModule,
  ],
  controllers: [TasksController], // Keep for backwards compatibility (Redis pub/sub)
  providers: [
    TasksService,
    TasksProcessor, // BullMQ processor for exactly-once job processing
    DepartureReminderService, // sweep: tells a member when to set off
  ],
  exports: [TasksService],
})
export class TasksModule {}
