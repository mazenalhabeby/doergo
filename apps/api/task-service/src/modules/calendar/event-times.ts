import { BadRequestException } from '@nestjs/common';
import { EVENT_MAX_DURATION_DAYS, addDaysStr, localPartsIn, zonedWallTimeToUtc } from '@hbcfield/shared';
import { DAY, ISO, DATE, EventInput, EventRow } from './events-helpers';

/** The times of an event, read and checked. */
export function eventTimes(input: EventInput, tz: string, current?: EventRow) {
  const allDay = input.allDay ?? current?.allDay ?? false;
  let startAt: Date, endAt: Date;
  if (allDay) {
    const sd = input.startDate ?? (current ? localPartsIn(current.startAt, tz).dateStr : undefined);
    // A PATCH without an end keeps the end it had — falling back to the start shrank a 5-day event to 1.
    const ed =
      input.endDate ??
      (current && current.allDay && !input.startDate
        ? localPartsIn(new Date(current.endAt.getTime() - 1), tz).dateStr
        : sd);
    if (!sd || !DATE.test(sd) || !ed || !DATE.test(ed) || ed < sd)
      throw new BadRequestException({
        code: 'EVENT_TIME_INVALID',
        message: 'Choose a start day on or before the end day.',
      });
    startAt = zonedWallTimeToUtc(sd, 0, 0, tz);
    endAt = zonedWallTimeToUtc(addDaysStr(ed, 1), 0, 0, tz);
  } else {
    const s = input.startAt ?? current?.startAt.toISOString();
    const e = input.endAt ?? current?.endAt.toISOString();
    if (!s || !e || !ISO.test(s) || !ISO.test(e))
      throw new BadRequestException({ code: 'EVENT_TIME_INVALID', message: 'Choose when it starts and ends.' });
    startAt = new Date(s);
    endAt = new Date(e);
    if (!(endAt.getTime() > startAt.getTime()))
      throw new BadRequestException({ code: 'EVENT_TIME_INVALID', message: 'It must end after it starts.' });
  }
  if (endAt.getTime() - startAt.getTime() > EVENT_MAX_DURATION_DAYS * DAY) {
    throw new BadRequestException({
      code: 'EVENT_TOO_LONG',
      message: `An appointment lasts at most ${EVENT_MAX_DURATION_DAYS} days.`,
    });
  }
  const year = startAt.getUTCFullYear();
  if (year < 2000 || year > 2200)
    throw new BadRequestException({ code: 'EVENT_TIME_INVALID', message: 'That date is out of range.' });
  return { allDay, startAt, endAt };
}
