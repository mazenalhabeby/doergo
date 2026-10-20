import { CalendarModule } from '../calendar/calendar.module';
import { ChatModule } from '../chat/chat.module';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QUEUE_NAMES } from '@hbcfield/shared';
import { SpacesController } from './spaces.controller';
import { SpaceAssignmentsController } from './space-assignments.controller';
import { SpacesService } from './spaces.service';
import { SpacesQueueService } from './spaces.queue.service';

@Module({
  imports: [
    // Saving a workspace nudges the holiday-place lookup.
    CalendarModule,
    // Team rows say whether the caller may message each person (chat's rule).
    ChatModule,
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
  controllers: [SpacesController, SpaceAssignmentsController],
  providers: [SpacesService, SpacesQueueService],
  exports: [SpacesService],
})
export class SpacesModule {}
