/** task-service calendar handlers — contracts (request types are what the handler reads). */
import { rpc } from '../contract';
import type { CalendarCaller, CalendarEventMessage, CalendarItemsQuery, HolidayScope } from './task-service-1-types';
import type { RsvpResponse } from '../../calendar/types';

export const calendarItems = rpc<CalendarItemsQuery>('calendar_items');
export const calendarTeam = rpc<CalendarCaller & { spaceId: string; from: string; to: string; teamSpaces?: string[] }>(
  'calendar_team',
);
export const calendarSettings = rpc<{
  organizationId: string;
  year?: number;
  lang?: string;
  scopeSpaceIds?: HolidayScope;
}>('calendar_settings');
export const calendarCountries = rpc<{ lang?: string }>('calendar_countries');
export const calendarRegions = rpc<{ country: string; lang?: string }>('calendar_regions');
export const calendarUpdateOrg = rpc<{
  organizationId: string;
  weekendDays?: unknown;
  holidayCountry?: unknown;
  holidayRegion?: unknown;
  calendarFeedsEnabled?: unknown;
}>('calendar_update_org');
export const calendarUpdateSpace = rpc<{
  organizationId: string;
  spaceId: string;
  scopeSpaceIds?: HolidayScope;
  weekendDays?: unknown;
  holidayCountry?: unknown;
  holidayRegion?: unknown;
}>('calendar_update_space');
export const calendarHolidays = rpc<{ organizationId: string; spaceId?: string | null; year?: number; lang?: string }>(
  'calendar_holidays',
);
export const calendarHolidaySave = rpc<{
  organizationId: string;
  userId: string;
  spaceId?: string | null;
  scopeSpaceIds?: HolidayScope;
  id?: string;
  libraryKey?: string | null;
  date: string;
  days?: number;
  name: string;
  halfDay?: boolean;
  confirmed?: boolean;
  removed?: boolean;
}>('calendar_holiday_save');
export const calendarHolidayRemove = rpc<{ organizationId: string; id: string; scopeSpaceIds?: HolidayScope }>(
  'calendar_holiday_remove',
);
export const calendarSetDetectedPlace = rpc<{
  organizationId: string;
  spaceId: string;
  country: string | null;
  stateCode?: string | null;
  stateName?: string | null;
}>('calendar_set_detected_place');
export const calendarPlacesToDetect = rpc<
  { limit?: number } | undefined,
  { data?: { id: string; organizationId: string; lat: number; lng: number }[] } | null
>('calendar_places_to_detect');
export const calendarEventCreate = rpc<CalendarCaller & { input: CalendarEventMessage; clientId?: string }>(
  'calendar_event_create',
);
export const calendarEventUpdate = rpc<CalendarCaller & { eventId: string; input: CalendarEventMessage }>(
  'calendar_event_update',
);
export const calendarEventCancel = rpc<CalendarCaller & { eventId: string }>('calendar_event_cancel');
export const calendarEventGet = rpc<CalendarCaller & { eventId: string }>('calendar_event_get');
export const calendarEventRespond = rpc<CalendarCaller & { eventId: string; response: RsvpResponse }>(
  'calendar_event_respond',
);
export const calendarEventSnooze = rpc<CalendarCaller & { eventId: string; minutes?: number; occurrence?: string }>(
  'calendar_event_snooze',
);
export const calendarEventDone = rpc<CalendarCaller & { eventId: string; occurrence?: string }>('calendar_event_done');
export const calendarPeople = rpc<CalendarCaller & { q?: string }>('calendar_people');
export const calendarAvailability = rpc<CalendarCaller & { userIds: string[]; from: string; to: string }>(
  'calendar_availability',
);
export const calendarFreeSlots = rpc<
  CalendarCaller & { userIds: string[]; durationMin: number; from?: string; days?: number; timezone?: string }
>('calendar_free_slots');
export const calendarFeedStatus = rpc<{ userId: string; organizationId: string }>('calendar_feed_status');
export const calendarFeedRotate = rpc<{ userId: string; organizationId: string }>('calendar_feed_rotate');
export const calendarFeedRevoke = rpc<{ userId: string }>('calendar_feed_revoke');
export const calendarFeedRender = rpc<{ token: string }>('calendar_feed_render');
