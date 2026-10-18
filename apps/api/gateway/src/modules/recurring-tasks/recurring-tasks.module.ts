import { Module } from '@nestjs/common';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTasksService } from './recurring-tasks.service';

@Module({
  imports: [
  ],
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService],
})
export class RecurringTasksModule {}
