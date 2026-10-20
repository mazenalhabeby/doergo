/** Events about the company calendar: invites, changes, answers, reminders. */
import { event } from '../event';
import type { CalendarEventFacts } from './events-types';

export const calendarInvitedEvent = event<CalendarEventFacts>('calendar_invited');

export const calendarUpdatedEvent = event<CalendarEventFacts>('calendar_updated');

export const calendarCanceledEvent = event<CalendarEventFacts>('calendar_canceled');

export const calendarRespondedEvent = event<{
  organizationId: string;
  eventId: string;
  title: string;
  organizerId: string;
  responderName?: string;
  response: 'ACCEPTED' | 'MAYBE' | 'DECLINED';
}>('calendar_responded');

export const calendarReminderEvent = event<{
  organizationId: string;
  userId: string;
  eventId: string;
  title: string;
  occurrence: string;
  allDay?: boolean;
  timezone?: string;
  minutes: number;
}>('calendar_reminder');

export const calendarChangedEvent = event<{ userIds?: string[] }>('calendar_changed');

export const calendarSettingsChangedEvent = event<{ organizationId?: string }>('calendar_settings_changed');
