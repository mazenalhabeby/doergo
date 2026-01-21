import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QUEUE_NAMES, SERVICE_NAMES, createClientOptions } from '@doergo/shared';
import { TasksController } from './tasks.controller';
import { TasksQueueService } from './tasks.queue.service';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    // Register task-service client for direct read operations
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)]),
    // Register the tasks queue for write operations (create, update, delete, etc.)
    BullModule.registerQueue({
      name: QUEUE_NAMES.TASKS,
    }),
    // Add to Bull Board for monitoring
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.TASKS,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [TasksController],
  providers: [TasksQueueService, TasksService],
})
export class TasksModule {}
