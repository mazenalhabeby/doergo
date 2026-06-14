import { Module } from '@nestjs/common';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTasksService } from './recurring-tasks.service';

@Module({
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService],
  exports: [RecurringTasksService],
})
export class RecurringTasksModule {}
