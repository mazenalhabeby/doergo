import { Module } from '@nestjs/common';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTasksService } from './recurring-tasks.service';
import { RecurringRunnerService } from './recurring-runner.service';

@Module({
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService, RecurringRunnerService],
  exports: [RecurringTasksService],
})
export class RecurringTasksModule {}
