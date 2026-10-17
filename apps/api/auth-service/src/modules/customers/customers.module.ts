import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { ContactImportService } from './contact-import.service';
import { CustomerReminderScheduler } from './customer-reminder.scheduler';
import { CustomerWriteService } from './customer-write.service';
import { CustomerContactsService } from './customer-contacts.service';
import { CustomerActivitiesService } from './customer-activities.service';
import { CustomerDueService } from './customer-due.service';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomerWriteService,
    CustomerContactsService,
    CustomerActivitiesService,
    CustomerDueService,
    ContactImportService,
    CustomerReminderScheduler,
  ],
  exports: [
    CustomersService,
    CustomerWriteService,
    CustomerContactsService,
    CustomerActivitiesService,
    CustomerDueService,
  ],
})
export class CustomersModule {}
