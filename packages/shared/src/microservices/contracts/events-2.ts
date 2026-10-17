import { event } from '../event';
import type { CalendarEventFacts, SentNotRead } from './events-types';

/**
 * Events handled by notification-service (attendance-notification.handler, break-notification.handler, calendar-
 * notification.handler). Payload = what the handler reads.
 */

export const attendanceShiftReminderEvent = event<{
  entryId: string;
  userId: string;
  userName: string;
  locationId: string;
  locationName: string;
  expectedClockOutAt: string | null;
  reminderCount: number;
  unscheduled?: boolean;
  hoursOpen?: number;
  organizationId: string;
}>('attendance_shift_reminder');

export const attendanceLeftEarlyEvent = event<
  {
    entryId: string;
    userId: string;
    userName: string;
    locationId: string;
    locationName: string;
    shortfallMinutes: number;
    reason?: string | null;
    leaderIds: string[];
    organizationId: string;
  } & SentNotRead<'expectedClockOutAt'>
>('attendance_left_early');

export const attendanceShiftEscalationEvent = event<{
  entryId: string;
  userId: string;
  userName: string;
  locationId: string;
  locationName: string;
  expectedClockOutAt: string | null;
  unscheduled?: boolean;
  hoursOpen?: number;
  leaderIds: string[];
  organizationId: string;
}>('attendance_shift_escalation');

export const attendanceShiftClosedProvisionallyEvent = event<{
  entryId: string;
  userId: string;
  clockInAt: string;
  clockOutAt: string;
  basis: string;
  timezone?: string | null;
  locationName?: string | null;
  organizationId: string;
}>('attendance_shift_closed_provisionally');

export const attendanceShiftEscalationResolvedEvent = event<{
  entryId: string;
  userId: string;
  userName: string;
  clockOutAt: string;
  timezone?: string | null;
  recordedOffline: boolean;
  leaderIds: string[];
  organizationId: string;
}>('attendance_shift_escalation_resolved');

export const attendanceBreakDueEvent = event<
  {
    entryId: string;
    userId: string;
    ruleId: string;
    name: string;
    durationMinutes: number;
    isPaid: boolean;
    expiresAt?: string | null;
    snoozeCount: number;
    locationName: string;
    organizationId: string;
  } & SentNotRead<'userName' | 'locationId'>
>('attendance_break_due');

export const attendanceBreakOverEvent = event<
  {
    entryId: string;
    userId: string;
    breakId: string;
    name: string;
    durationMinutes: number;
    organizationId: string;
  } & SentNotRead<'userName' | 'locationId' | 'locationName'>
>('attendance_break_over');

export const autoClockOfferedEvent = event<{
  organizationId: string;
  spaceId: string;
  spaceName: string;
  userIds: string[];
}>('auto_clock_offered');

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
