import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QUEUE_NAMES, SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ReportsController } from './reports.controller';
import { ReportsQueueService } from './reports.queue.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.REPORTS,
    }),
    // Add to Bull Board for monitoring
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.REPORTS,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsQueueService, ReportsService],
})
export class ReportsModule {}
