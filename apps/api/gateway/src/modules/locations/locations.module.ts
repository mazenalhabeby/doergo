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
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationsQueueService } from './locations.queue.service';

@Module({
  imports: [
    // Microservice client for READ operations
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)]),
    // BullMQ queue for WRITE operations
    BullModule.registerQueue({ name: QUEUE_NAMES.LOCATIONS }),
    // Bull Board for monitoring
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.LOCATIONS,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [LocationsController],
  providers: [LocationsService, LocationsQueueService],
})
export class LocationsModule {}
