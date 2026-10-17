import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QUEUE_NAMES } from '@hbcfield/shared';
import { TasksController } from './tasks.controller';
import { TaskListController } from './task-list.controller';
import { TaskCrewController } from './task-crew.controller';
import { TaskActivityController } from './task-activity.controller';
import { TaskChecklistController } from './task-checklist.controller';
import { TaskAttachmentsController } from './task-attachments.controller';
import { TaskReportController } from './task-report.controller';
import { TasksQueueService } from './tasks.queue.service';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.TASKS,
    }),
    // Add to Bull Board for monitoring
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.TASKS,
      adapter: BullMQAdapter,
    }),
  ],
  // ⚠️ ORDER MATTERS: TaskListController's one-segment paths (counts, open-for-me,
  // role-options, role-preview, role-stats) must come before `GET :id`.
  controllers: [
    TaskListController,
    TasksController,
    TaskCrewController,
    TaskActivityController,
    TaskChecklistController,
    TaskAttachmentsController,
    TaskReportController,
  ],
  providers: [TasksQueueService, TasksService],
  exports: [TasksQueueService],
})
export class TasksModule {}
