import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { eventPattern, type EventPayload, attendanceDayDecidedEvent } from '@hbcfield/shared/microservices';
import type { SupportedLocale } from '@hbcfield/shared';
import { msg } from '../../../i18n/translate';
import { duration } from '../../push/push-helpers';
import { PushService } from '../../push/push.service';

/** "Thursday" in the reader's language, first letter up — it opens the sentence. */
export const weekdayOf = (localDate: string) => (locale: SupportedLocale) => {
  const name = new Date(`${localDate}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
};

/**
 * A person hears when their working day is decided — before, hours were approved
 * or rejected in silence. One push per day: the task-service sends the event
 * only when the last entry of the day still waiting leaves review. It opens
 * Time history on the phone (`type: attendance_day_decided`).
 */
@Controller()
export class DayDecidedHandler {
  private readonly logger = new Logger('DayDecidedHandler');

  constructor(@Inject(PushService) private readonly push: PushService) {}

  @EventPattern(eventPattern(attendanceDayDecidedEvent))
  async handle(@Payload() data: EventPayload<typeof attendanceDayDecidedEvent>) {
    const day = weekdayOf(data.localDate);
    const text = data.approved
      ? {
          title: msg('attendance.dayDecided.titleApproved', { day }),
          body: msg('attendance.dayDecided.bodyApproved', { day, counted: duration(data.countedMinutes) }),
        }
      : {
          title: msg('attendance.dayDecided.titleRejected', { day }),
          body: msg('attendance.dayDecided.bodyRejected', { day }),
        };
    try {
      await this.push.sendToUser(data.userId, text, {
        type: 'attendance_day_decided',
        localDate: data.localDate,
        approved: data.approved,
      });
    } catch (error) {
      this.logger.error(`Failed to send day-decided push: ${error}`);
    }
  }
}
