import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TaskCoreModule } from '../core/task-core.module';
import { HandoverModule } from '../handover/handover.module';
import { TaskQueryService } from './task-query.service';
import { TaskDetailService } from './task-detail.service';
import { TaskActivityService } from './task-activity.service';

/**
 * Reading jobs: the lists, one job's page, its activity.
 */
@Module({
  imports: [
    TaskCoreModule,
    HandoverModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [TaskQueryService, TaskDetailService, TaskActivityService],
  exports: [TaskQueryService, TaskDetailService, TaskActivityService],
})
export class TaskQueryModule {}
