import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import {
  SERVICE_NAMES,
  createClientOptions,
  QUEUE_NAMES,
} from '@doergo/shared';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceQueueService } from './attendance.queue.service';

@Module({
  imports: [
    // Microservice client for READ operations
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)]),
    // BullMQ queue for WRITE operations
    BullModule.registerQueue({ name: QUEUE_NAMES.ATTENDANCE }),
    // Bull Board for monitoring
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.ATTENDANCE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceQueueService],
})
export class AttendanceModule {}
