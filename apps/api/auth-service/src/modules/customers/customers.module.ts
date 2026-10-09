import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { ContactImportService } from './contact-import.service';
import { CustomerReminderScheduler } from './customer-reminder.scheduler';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [CustomersController],
  providers: [CustomersService, ContactImportService, CustomerReminderScheduler],
  exports: [CustomersService],
})
export class CustomersModule {}
