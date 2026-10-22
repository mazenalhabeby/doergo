import { Module } from '@nestjs/common';
import { TaskSupportService } from './task-support.service';

/**
 * What every part of the tasks module shares: the event log, the watchers a task event reaches, the
 * task gate and the status-count cache (TaskSupportService).
 */
@Module({
  providers: [TaskSupportService],
  exports: [TaskSupportService],
})
export class TaskCoreModule {}
