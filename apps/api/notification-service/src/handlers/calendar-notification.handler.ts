import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  calendarCanceledEvent,
  calendarChangedEvent,
  calendarInvitedEvent,
  calendarReminderEvent,
  calendarRespondedEvent,
  calendarSettingsChangedEvent,
  calendarUpdatedEvent,
} from '@hbcfield/shared/microservices';

import type { SupportedLocale } from '@hbcfield/shared';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { msg, type LocalizedText, type MsgParam } from '../i18n/translate';

/** The phone's buttons on these pushes (apps/mobile usePushNotifications). */
export const CALENDAR_REMINDER_CATEGORY = 'calendar_reminder';
export const CALENDAR_INVITE_CATEGORY = 'calendar_invite';

/** "Sat 31 Oct, 15:00" in the reader's language, in the event's own zone. */
export function whenText(iso: string, allDay: boolean | undefined, tz: string | undefined): MsgParam {
  return (locale: SupportedLocale) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const zone = tz || 'Europe/Vienna';
    try {
      return new Intl.DateTimeFormat(
        locale,
        allDay
          ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }
          : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone },
      ).format(d);
    } catch {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  };
}

/**
 * The calendar's deliveries. The decisions — who is on an event, when a reminder is due — are made
 * in task-service; this only writes the words in each reader's language and sends them.
 */
@Controller()
export class CalendarNotificationHandler {
  private readonly logger = new Logger('CalendarNotificationHandler');

  constructor(
    private readonly push: PushService,
    private readonly ws: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  private async deliver(
    ids: string[],
    organizationId: string,
    eventType: string,
    text: LocalizedText,
    data: Record<string, unknown>,
  ) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;
    try {
      await this.push.sendToUsers(unique, text, data);
    } catch (e) {
      this.logger.error(`Calendar push failed (${eventType}): ${e}`);
    }
    for (const id of unique) this.ws.emitToUser(id, 'calendar.changed', { eventId: data.eventId ?? null });
    await this.store.record({
      recipientIds: unique,
      organizationId,
      eventType,
      text,
      link: '/calendar',
      data: { eventId: data.eventId },
    });
  }

  @EventPattern(eventPattern(calendarInvitedEvent))
  async invited(@Payload() d: EventPayload<typeof calendarInvitedEvent>) {
    await this.deliver(
      d.userIds,
      d.organizationId,
      'calendar.invited',
      {
        title: msg('calendar.invited.title', { title: d.title }, 80),
        body: msg('calendar.invited.body', {
          when: whenText(d.startAt, d.allDay, d.timezone),
          name: d.organizerName ?? '',
        }),
      },
      { type: 'calendar_invite', eventId: d.eventId, category: CALENDAR_INVITE_CATEGORY },
    );
  }

  @EventPattern(eventPattern(calendarUpdatedEvent))
  async updated(@Payload() d: EventPayload<typeof calendarUpdatedEvent>) {
    await this.deliver(
      d.userIds,
      d.organizationId,
      'calendar.updated',
      {
        title: msg('calendar.updated.title', { title: d.title }, 80),
        body: msg('calendar.updated.body', { when: whenText(d.startAt, d.allDay, d.timezone) }),
      },
      { type: 'calendar_invite', eventId: d.eventId, category: CALENDAR_INVITE_CATEGORY },
    );
  }

  @EventPattern(eventPattern(calendarCanceledEvent))
  async canceled(@Payload() d: EventPayload<typeof calendarCanceledEvent>) {
    await this.deliver(
      d.userIds,
      d.organizationId,
      'calendar.canceled',
      {
        title: msg('calendar.canceled.title', { title: d.title }, 80),
        body: msg('calendar.canceled.body', {
          when: whenText(d.startAt, d.allDay, d.timezone),
          name: d.organizerName ?? '',
        }),
      },
      { type: 'calendar_canceled', eventId: d.eventId },
    );
  }

  @EventPattern(eventPattern(calendarRespondedEvent))
  async responded(
    @Payload()
    d: EventPayload<typeof calendarRespondedEvent>,
  ) {
    const key =
      d.response === 'ACCEPTED'
        ? 'calendar.responded.accepted'
        : d.response === 'MAYBE'
          ? 'calendar.responded.maybe'
          : 'calendar.responded.declined';
    await this.deliver(
      [d.organizerId],
      d.organizationId,
      'calendar.responded',
      {
        title: msg('common.verbatim', { text: d.title }, 80),
        body: msg(key, { name: d.responderName ?? '' }),
      },
      { type: 'calendar_answer', eventId: d.eventId },
    );
  }

  @EventPattern(eventPattern(calendarReminderEvent))
  async reminder(
    @Payload()
    d: EventPayload<typeof calendarReminderEvent>,
  ) {
    const when = whenText(d.occurrence, d.allDay, d.timezone);
    await this.deliver(
      [d.userId],
      d.organizationId,
      'calendar.reminder',
      {
        title: msg('common.verbatim', { text: d.title }, 80),
        body:
          d.minutes <= 0
            ? msg('calendar.reminder.now', { when })
            : msg('calendar.reminder.soon', { minutes: d.minutes, when }),
      },
      { type: 'calendar_reminder', eventId: d.eventId, occurrence: d.occurrence, category: CALENDAR_REMINDER_CATEGORY },
    );
  }

  /** Something on these people's calendars changed — their open screens re-read. No push. */
  @EventPattern(eventPattern(calendarChangedEvent))
  changed(@Payload() d: EventPayload<typeof calendarChangedEvent>) {
    for (const id of new Set(d?.userIds ?? [])) this.ws.emitToUser(id, 'calendar.changed', {});
  }

  /** Holidays or weekends changed — every screen in the organization re-reads. */
  @EventPattern(eventPattern(calendarSettingsChangedEvent))
  settingsChanged(@Payload() d: EventPayload<typeof calendarSettingsChangedEvent>) {
    if (d?.organizationId) this.ws.emitToOrganization(d.organizationId, 'calendar.settingsChanged', {});
  }
}
