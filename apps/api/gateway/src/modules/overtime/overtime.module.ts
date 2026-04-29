import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { OvertimeController } from './overtime.controller';
import { OvertimeGatewayService } from './overtime.service';
import { OvertimeQueueService } from './overtime.queue.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.OVERTIME }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.OVERTIME,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [OvertimeController],
  providers: [OvertimeGatewayService, OvertimeQueueService],
})
export class OvertimeModule {}
