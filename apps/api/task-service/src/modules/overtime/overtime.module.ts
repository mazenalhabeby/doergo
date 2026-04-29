import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { OvertimeService } from './overtime.service';
import { OvertimeProcessor } from './overtime.processor';
import { OvertimeScheduler } from './overtime.scheduler';
import { OvertimeController } from './overtime.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.OVERTIME }),
  ],
  controllers: [OvertimeController],
  providers: [OvertimeService, OvertimeProcessor, OvertimeScheduler],
  exports: [OvertimeService],
})
export class OvertimeModule {}
