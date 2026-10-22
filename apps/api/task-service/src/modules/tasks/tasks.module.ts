import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksProcessor } from './tasks.processor';
import { AttachmentsModule } from '../attachments/attachments.module';
import { HandoverModule } from './handover/handover.module';
import { TaskCoreModule } from './core/task-core.module';
import { TaskAssignmentModule } from './assignment/task-assignment.module';
import { TaskRecordsModule } from './records/task-records.module';
import { TaskStatusModule } from './status/task-status.module';
import { TaskQueryModule } from './query/task-query.module';
import { TaskChecklistModule } from './checklist/task-checklist.module';
import { TaskReportModule } from './report/task-report.module';
import { TaskSweepsModule } from './sweeps/task-sweeps.module';

/**
 * Jobs. Each part is its own module (code-structure-fix 4.1): core · assignment & role pool · records ·
 * status · query · checklist · report · sweeps, plus handover (pause, crew, job time). This module holds
 * only what spans them: the TasksService facade every caller injects, the BullMQ processor and the
 * message controller.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    AttachmentsModule, // the processor files and removes attachments
    HandoverModule,
    TaskCoreModule,
    TaskAssignmentModule,
    TaskRecordsModule,
    TaskStatusModule,
    TaskQueryModule,
    TaskChecklistModule,
    TaskReportModule,
    TaskSweepsModule,
  ],
  controllers: [TasksController], // Keep for backwards compatibility (Redis pub/sub)
  providers: [
    TasksService,
    TasksProcessor, // BullMQ processor for exactly-once job processing
  ],
  exports: [TasksService, TaskAssignmentModule],
})
export class TasksModule {}
