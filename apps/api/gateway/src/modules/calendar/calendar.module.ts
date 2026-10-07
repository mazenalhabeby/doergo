import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarGatewayService } from './calendar.service';
import { WorkspacePlaceDetector } from './workspace-place.detector';

@Module({
  controllers: [CalendarController, CalendarFeedController],
  providers: [CalendarGatewayService, WorkspacePlaceDetector],
  exports: [WorkspacePlaceDetector],
})
export class CalendarModule {}
