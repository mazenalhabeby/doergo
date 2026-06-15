import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTasksService } from './recurring-tasks.service';

@Module({
  imports: [
  ],
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService],
})
export class RecurringTasksModule {}
