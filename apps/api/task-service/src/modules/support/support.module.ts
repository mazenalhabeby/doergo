import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { SupportProcessor } from './support.processor';
import { SupportInboxService } from './support-inbox.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.SUPPORT }),
  ],
  controllers: [SupportController],
  providers: [SupportService, SupportInboxService, SupportProcessor],
  exports: [SupportService],
})
export class SupportModule {}
