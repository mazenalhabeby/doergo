import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksProcessor } from './tasks.processor';
import { AttachmentsModule } from '../attachments/attachments.module';
import { NotificationRoutingService } from '../../common/notification-routing.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    AttachmentsModule,
  ],
  controllers: [TasksController], // Keep for backwards compatibility (Redis pub/sub)
  providers: [
    TasksService,
    TasksProcessor, // BullMQ processor for exactly-once job processing
    NotificationRoutingService, // resolve per-member watchers for task alerts
  ],
  exports: [TasksService],
})
export class TasksModule {}
