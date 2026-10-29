import { Module } from '@nestjs/common';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTasksService } from './recurring-tasks.service';
import { RecurringRunnerService } from './recurring-runner.service';
import { TaskRecordsModule } from '../tasks/records/task-records.module';

@Module({
  // A generated job is announced like a typed one (TaskRecordsService.announceNew).
  imports: [TaskRecordsModule],
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService, RecurringRunnerService],
  exports: [RecurringTasksService],
})
export class RecurringTasksModule {}
