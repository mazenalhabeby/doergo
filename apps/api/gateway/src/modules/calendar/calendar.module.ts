import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarGatewayService } from './calendar.service';

@Module({
  controllers: [CalendarController, CalendarFeedController],
  providers: [CalendarGatewayService],
})
export class CalendarModule {}
