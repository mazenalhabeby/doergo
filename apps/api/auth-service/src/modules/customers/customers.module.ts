import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerReminderScheduler } from './customer-reminder.scheduler';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerReminderScheduler],
  exports: [CustomersService],
})
export class CustomersModule {}
