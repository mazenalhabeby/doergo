import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QUEUE_NAMES } from '@hbcfield/shared';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmQueueService } from './crm.queue.service';

@Module({
  imports: [
    // WRITE operations → task-service CRM processor
    BullModule.registerQueue({ name: QUEUE_NAMES.CRM }),
    BullBoardModule.forFeature({ name: QUEUE_NAMES.CRM, adapter: BullMQAdapter }),
  ],
  controllers: [CrmController],
  providers: [CrmService, CrmQueueService],
})
export class CrmModule {}
