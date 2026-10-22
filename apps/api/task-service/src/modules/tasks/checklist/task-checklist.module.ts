import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TaskCoreModule } from '../core/task-core.module';
import { HandoverModule } from '../handover/handover.module';
import { TaskChecklistService } from './task-checklist.service';

/**
 * A job's checklist: items, owners, ticks.
 */
@Module({
  imports: [
    TaskCoreModule,
    HandoverModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [TaskChecklistService],
  exports: [TaskChecklistService],
})
export class TaskChecklistModule {}
