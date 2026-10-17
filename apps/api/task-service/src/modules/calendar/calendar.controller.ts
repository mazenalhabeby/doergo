import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { CalendarService, type ItemsQuery } from './calendar.service';
import { EventsService, type Caller, type EventInput } from './events.service';
import { HolidaysService } from './holidays.service';
import { FeedService } from './feed.service';
import { EventAnswersService } from './event-answers.service';
import { EventReadService } from './event-read.service';
import { AvailabilityService } from './availability.service';
import {
  pattern,
  type RpcRequest,
  calendarItems,
  calendarTeam,
  calendarSettings,
  calendarCountries,
  calendarRegions,
  calendarUpdateOrg,
  calendarUpdateSpace,
  calendarHolidays,
  calendarHolidaySave,
  calendarHolidayRemove,
  calendarSetDetectedPlace,
  calendarPlacesToDetect,
  calendarEventCreate,
  calendarEventUpdate,
  calendarEventCancel,
  calendarEventGet,
  calendarEventRespond,
  calendarEventSnooze,
  calendarEventDone,
  calendarPeople,
  calendarAvailability,
  calendarFreeSlots,
  calendarFeedStatus,
  calendarFeedRotate,
  calendarFeedRevoke,
  calendarFeedRender,
} from '@hbcfield/shared/microservices';

/** The calendar over RPC. Every payload's identity (userId, organizationId, scopes) comes from the gateway's token. */
@Controller()
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly events: EventsService,
    private readonly freeBusy: AvailabilityService,
    private readonly eventRead: EventReadService,
    private readonly eventAnswers: EventAnswersService,
    private readonly holidays: HolidaysService,
    private readonly feed: FeedService,
  ) {}

  @MessagePattern(pattern(calendarItems)) items(@Payload() d: RpcRequest<typeof calendarItems>) {
    return this.calendar.items(d);
  }
  @MessagePattern(pattern(calendarTeam)) team(@Payload() d: RpcRequest<typeof calendarTeam>) {
    return this.calendar.team(d);
  }

  @MessagePattern(pattern(calendarSettings)) settings(@Payload() d: RpcRequest<typeof calendarSettings>) {
    return this.holidays.settings(d);
  }
  @MessagePattern(pattern(calendarCountries)) countries(@Payload() d: RpcRequest<typeof calendarCountries>) {
    return this.holidays.countries(d);
  }
  @MessagePattern(pattern(calendarRegions)) regions(@Payload() d: RpcRequest<typeof calendarRegions>) {
    return this.holidays.regions(d);
  }
  @MessagePattern(pattern(calendarUpdateOrg)) updateOrg(@Payload() d: RpcRequest<typeof calendarUpdateOrg>) {
    return this.holidays.updateOrganization(d);
  }
  @MessagePattern(pattern(calendarUpdateSpace)) updateSpace(@Payload() d: RpcRequest<typeof calendarUpdateSpace>) {
    return this.holidays.updateWorkspace(d);
  }
  @MessagePattern(pattern(calendarHolidays)) holidaysList(@Payload() d: RpcRequest<typeof calendarHolidays>) {
    return this.holidays.list(d);
  }
  @MessagePattern(pattern(calendarHolidaySave)) holidaySave(@Payload() d: RpcRequest<typeof calendarHolidaySave>) {
    return this.holidays.save(d);
  }
  @MessagePattern(pattern(calendarHolidayRemove)) holidayRemove(
    @Payload() d: RpcRequest<typeof calendarHolidayRemove>,
  ) {
    return this.holidays.remove(d);
  }
  // Internal only — the gateway's geocoder, never a client route.
  @MessagePattern(pattern(calendarSetDetectedPlace)) setDetectedPlace(
    @Payload() d: RpcRequest<typeof calendarSetDetectedPlace>,
  ) {
    return this.holidays.setDetectedPlace(d);
  }
  @MessagePattern(pattern(calendarPlacesToDetect)) placesToDetect(
    @Payload() d: RpcRequest<typeof calendarPlacesToDetect>,
  ) {
    return this.holidays.placesToDetect(d ?? {});
  }

  @MessagePattern(pattern(calendarEventCreate)) create(@Payload() d: RpcRequest<typeof calendarEventCreate>) {
    return this.events.create(d);
  }
  @MessagePattern(pattern(calendarEventUpdate)) update(@Payload() d: RpcRequest<typeof calendarEventUpdate>) {
    return this.events.update(d);
  }
  @MessagePattern(pattern(calendarEventCancel)) cancel(@Payload() d: RpcRequest<typeof calendarEventCancel>) {
    return this.events.cancel(d);
  }
  @MessagePattern(pattern(calendarEventGet)) get(@Payload() d: RpcRequest<typeof calendarEventGet>) {
    return this.events.get(d);
  }
  @MessagePattern(pattern(calendarEventRespond)) respond(@Payload() d: RpcRequest<typeof calendarEventRespond>) {
    return this.eventAnswers.respond(d);
  }
  @MessagePattern(pattern(calendarEventSnooze)) snooze(@Payload() d: RpcRequest<typeof calendarEventSnooze>) {
    return this.eventAnswers.snooze(d);
  }
  @MessagePattern(pattern(calendarEventDone)) done(@Payload() d: RpcRequest<typeof calendarEventDone>) {
    return this.eventAnswers.done(d);
  }
  @MessagePattern(pattern(calendarPeople)) people(@Payload() d: RpcRequest<typeof calendarPeople>) {
    return this.eventRead.people(d);
  }
  @MessagePattern(pattern(calendarAvailability)) availability(@Payload() d: RpcRequest<typeof calendarAvailability>) {
    return this.freeBusy.availability(d);
  }
  @MessagePattern(pattern(calendarFreeSlots)) freeSlots(@Payload() d: RpcRequest<typeof calendarFreeSlots>) {
    return this.freeBusy.freeSlots(d);
  }

  @MessagePattern(pattern(calendarFeedStatus)) feedStatus(@Payload() d: RpcRequest<typeof calendarFeedStatus>) {
    return this.feed.status(d);
  }
  @MessagePattern(pattern(calendarFeedRotate)) feedRotate(@Payload() d: RpcRequest<typeof calendarFeedRotate>) {
    return this.feed.rotate(d);
  }
  @MessagePattern(pattern(calendarFeedRevoke)) feedRevoke(@Payload() d: RpcRequest<typeof calendarFeedRevoke>) {
    return this.feed.revoke(d);
  }
  @MessagePattern(pattern(calendarFeedRender)) async feedRender(@Payload() d: RpcRequest<typeof calendarFeedRender>) {
    return success({ ics: await this.feed.render(d) });
  }
}
