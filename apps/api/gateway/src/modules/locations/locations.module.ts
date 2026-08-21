import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QUEUE_NAMES } from '@hbcfield/shared';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationsQueueService } from './locations.queue.service';

@Module({
  imports: [
    // Microservice clients come from the GLOBAL MicroservicesModule — the
    // controller injects AUTH_SERVICE to tell billing a space change moved the
    // bill. Registering it again here would create a second connection.
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
