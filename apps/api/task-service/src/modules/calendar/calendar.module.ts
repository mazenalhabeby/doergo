import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { PrismaModule, SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { CalendarRulesModule } from './calendar-rules.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { EventsService } from './events.service';
import { HolidaysService } from './holidays.service';
import { FeedService } from './feed.service';
import { ReminderSweepService } from './reminder-sweep.service';
import { EventAnswersService } from './event-answers.service';
import { EventReadService } from './event-read.service';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [PrismaModule, CalendarRulesModule, ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    EventsService,
    EventAnswersService,
    EventReadService,
    AvailabilityService,
    HolidaysService,
    FeedService,
    ReminderSweepService,
  ],
})
export class CalendarModule {}
