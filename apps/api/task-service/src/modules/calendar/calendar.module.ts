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
import { CalendarSourcesService } from './calendar-sources.service';
import { HolidayOverridesService } from './holiday-overrides.service';
import { EventViewService } from './event-view.service';
import { EventPeopleService } from './event-people.service';
import { EventNoticesService } from './event-notices.service';
import { EventChecksService } from './event-checks.service';
import { EventUpdateService } from './event-update.service';

@Module({
  imports: [
    PrismaModule,
    CalendarRulesModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [CalendarController],
  providers: [
    CalendarSourcesService,
    CalendarService,
    EventViewService,
    EventPeopleService,
    EventNoticesService,
    EventChecksService,
    EventUpdateService,
    EventsService,
    EventAnswersService,
    EventReadService,
    AvailabilityService,
    HolidayOverridesService,
    HolidaysService,
    FeedService,
    ReminderSweepService,
  ],
})
export class CalendarModule {}
