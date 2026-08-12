import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmProcessor } from './crm.processor';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.CRM }),
  ],
  controllers: [CrmController],
  providers: [CrmService, CrmProcessor],
  exports: [CrmService],
})
export class CrmModule {}
