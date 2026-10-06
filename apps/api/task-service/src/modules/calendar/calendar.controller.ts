import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { CalendarService, type ItemsQuery } from './calendar.service';
import { EventsService, type Caller, type EventInput } from './events.service';
import { HolidaysService } from './holidays.service';
import { FeedService } from './feed.service';

/** The calendar over RPC. Every payload's identity (userId, organizationId, scopes) comes from the gateway's token. */
@Controller()
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly events: EventsService,
    private readonly holidays: HolidaysService,
    private readonly feed: FeedService,
  ) {}

  @MessagePattern({ cmd: 'calendar_items' }) items(@Payload() d: ItemsQuery) { return this.calendar.items(d); }
  @MessagePattern({ cmd: 'calendar_team' }) team(@Payload() d: any) { return this.calendar.team(d); }

  @MessagePattern({ cmd: 'calendar_settings' }) settings(@Payload() d: any) { return this.holidays.settings(d); }
  @MessagePattern({ cmd: 'calendar_countries' }) countries(@Payload() d: { lang?: string }) { return this.holidays.countries(d); }
  @MessagePattern({ cmd: 'calendar_regions' }) regions(@Payload() d: { country: string; lang?: string }) { return this.holidays.regions(d); }
  @MessagePattern({ cmd: 'calendar_update_org' }) updateOrg(@Payload() d: any) { return this.holidays.updateOrganization(d); }
  @MessagePattern({ cmd: 'calendar_update_space' }) updateSpace(@Payload() d: any) { return this.holidays.updateWorkspace(d); }
  @MessagePattern({ cmd: 'calendar_holidays' }) holidaysList(@Payload() d: any) { return this.holidays.list(d); }
  @MessagePattern({ cmd: 'calendar_holiday_save' }) holidaySave(@Payload() d: any) { return this.holidays.save(d); }
  @MessagePattern({ cmd: 'calendar_holiday_remove' }) holidayRemove(@Payload() d: any) { return this.holidays.remove(d); }

  @MessagePattern({ cmd: 'calendar_event_create' }) create(@Payload() d: Caller & { input: EventInput; clientId?: string }) { return this.events.create(d); }
  @MessagePattern({ cmd: 'calendar_event_update' }) update(@Payload() d: Caller & { eventId: string; input: EventInput }) { return this.events.update(d); }
  @MessagePattern({ cmd: 'calendar_event_cancel' }) cancel(@Payload() d: Caller & { eventId: string }) { return this.events.cancel(d); }
  @MessagePattern({ cmd: 'calendar_event_get' }) get(@Payload() d: Caller & { eventId: string }) { return this.events.get(d); }
  @MessagePattern({ cmd: 'calendar_event_respond' }) respond(@Payload() d: any) { return this.events.respond(d); }
  @MessagePattern({ cmd: 'calendar_event_snooze' }) snooze(@Payload() d: any) { return this.events.snooze(d); }
  @MessagePattern({ cmd: 'calendar_event_done' }) done(@Payload() d: any) { return this.events.done(d); }
  @MessagePattern({ cmd: 'calendar_people' }) people(@Payload() d: any) { return this.events.people(d); }
  @MessagePattern({ cmd: 'calendar_availability' }) availability(@Payload() d: any) { return this.events.availability(d); }
  @MessagePattern({ cmd: 'calendar_free_slots' }) freeSlots(@Payload() d: any) { return this.events.freeSlots(d); }

  @MessagePattern({ cmd: 'calendar_feed_status' }) feedStatus(@Payload() d: any) { return this.feed.status(d); }
  @MessagePattern({ cmd: 'calendar_feed_rotate' }) feedRotate(@Payload() d: any) { return this.feed.rotate(d); }
  @MessagePattern({ cmd: 'calendar_feed_revoke' }) feedRevoke(@Payload() d: any) { return this.feed.revoke(d); }
  @MessagePattern({ cmd: 'calendar_feed_render' }) async feedRender(@Payload() d: { token: string }) { return success({ ics: await this.feed.render(d) }); }
}
