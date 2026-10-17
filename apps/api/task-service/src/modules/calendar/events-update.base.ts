/** Changing an event, and the checks creating one shares — moved here unchanged from events.service.ts. */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EVENT_MAX_DURATION_DAYS,
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  addDaysStr,
  firstReminder,
  localPartsIn,
  parseReminderOffsets,
  parseRepeat,
  zonedWallTimeToUtc,
  type Repeat,
} from '@hbcfield/shared';
import {
  DAY,
  ISO,
  DATE,
  Caller,
  EventInput,
  MEETING_KEYS,
  EventRow,
  validZone,
  clean,
  seriesEndOf,
} from './events-helpers';
import { EventsBase } from './events.base';
import type { Prisma } from '@prisma/client';

export abstract class EventsUpdateBase extends EventsBase {
  /** The times of an event, read and checked. */
  protected times(input: EventInput, tz: string, current?: EventRow) {
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

  protected async assertRefs(caller: Caller, spaceId: string | null, customerId: string | null) {
    if (spaceId) {
      const s = await this.prisma.companyLocation.findFirst({
        where: { id: spaceId, organizationId: caller.organizationId },
        select: { id: true },
      });
      if (!s) throw new BadRequestException('Workspace not found');
    }
    if (customerId) {
      if (!caller.crm)
        throw new ForbiddenException({
          code: 'EVENT_CLIENT_NOT_ALLOWED',
          message: 'Only somebody who works with clients can put one on an event.',
        });
      const c = await this.prisma.customer.findFirst({
        where: { id: customerId, organizationId: caller.organizationId },
        select: { id: true },
      });
      if (!c) throw new BadRequestException('Client not found');
    }
  }

  protected async loadForOrganizer(caller: Caller, eventId: string) {
    const ev = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, organizationId: caller.organizationId, canceledAt: null },
      include: { attendees: { select: { id: true, userId: true, response: true, isOrganizer: true } } },
    });
    if (!ev || !ev.attendees.some((a) => a.userId === caller.userId)) throw new NotFoundException('Not found');
    if (ev.createdById !== caller.userId)
      throw new ForbiddenException({
        code: 'EVENT_NOT_ORGANIZER',
        message: 'Only the person who made it can change it.',
      });
    return ev;
  }

  async update(dto: Caller & { eventId: string; input: EventInput }) {
    const ev = await this.loadForOrganizer(dto, dto.eventId);
    const input = dto.input ?? {};
    const tz = input.timezone !== undefined ? (validZone(input.timezone) ? input.timezone : ev.timezone) : ev.timezone;
    const { allDay, startAt, endAt } = this.times(input, tz, ev as unknown as EventRow);
    let repeat: Repeat | null = (ev.repeat as Repeat | null) ?? null;
    let offsets = ev.reminderOffsets;
    try {
      if (input.repeat !== undefined) repeat = parseRepeat(input.repeat);
      if (input.reminders !== undefined) offsets = parseReminderOffsets(input.reminders);
    } catch (e) {
      throw new BadRequestException({
        code: (e as Error).message,
        message: 'The repeat or reminder settings are not valid.',
      });
    }
    /*
      A CHANGE of time is a new question for everybody — but only when the values differ. A form
      sends every field on every save; reading "the key was present" as "it changed" reset every
      answer and re-sent "moved" to everyone over a typo fixed in the title.
    */
    const timesChanged =
      startAt.getTime() !== ev.startAt.getTime() ||
      endAt.getTime() !== ev.endAt.getTime() ||
      allDay !== ev.allDay ||
      tz !== ev.timezone ||
      JSON.stringify(repeat ?? null) !== JSON.stringify(ev.repeat ?? null);
    const title = input.title !== undefined ? clean(input.title, EVENT_TITLE_MAX) : ev.title;
    if (!title) throw new BadRequestException({ code: 'EVENT_TITLE_REQUIRED', message: 'Give it a title.' });
    const spaceId = input.spaceId !== undefined ? input.spaceId || null : ev.spaceId;
    const customerId = input.customerId !== undefined ? input.customerId || null : ev.customerId;
    await this.assertRefs(dto, spaceId, customerId);
    const kindNext = input.kind ? (input.kind === 'REMINDER' ? 'REMINDER' : 'APPOINTMENT') : ev.kind;
    // How and where are recomputed together whenever any of them is sent (a mode switch clears the rest).
    const touched =
      MEETING_KEYS.some((k) => input[k] !== undefined) || input.kind !== undefined || input.customerId !== undefined;
    const pick = <T>(k: (typeof MEETING_KEYS)[number], prev: T): T =>
      input[k] !== undefined ? (input[k] as unknown as T) : prev;
    const where = touched
      ? await this.meeting(
          dto,
          kindNext,
          {
            mode: pick('meetingMode', ev.meetingMode),
            place: pick('placeKind', ev.placeKind),
            placeSpaceId: pick('placeSpaceId', ev.placeSpaceId),
            room: pick('room', ev.room),
            location: pick('location', ev.location),
            meetingUrl: pick('meetingUrl', ev.meetingUrl),
            phone: pick('phone', ev.phone),
            callDirection: pick('callDirection', ev.callDirection),
          },
          customerId,
        )
      : null;

    const before = new Set(ev.attendees.filter((a) => !a.isOrganizer).map((a) => a.userId));
    let added: string[] = [],
      removed: string[] = [];
    if (input.attendeeIds !== undefined) {
      const wanted = await this.inviteable(dto, input.attendeeIds);
      added = [...wanted.keys()].filter((id) => !before.has(id));
      removed = [...before].filter((id) => !wanted.has(id));
    }

    const remindersChanged = timesChanged || JSON.stringify(offsets) !== JSON.stringify(ev.reminderOffsets);
    const next = remindersChanged ? firstReminder({ startAt, endAt, repeat, timezone: tz, offsets }, new Date()) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id: ev.id },
        data: {
          title,
          spaceId,
          customerId,
          startAt,
          endAt,
          allDay,
          timezone: tz,
          repeat: (repeat as unknown as Prisma.InputJsonValue) ?? null,
          seriesEndAt: seriesEndOf(startAt, endAt, repeat, tz),
          reminderOffsets: offsets,
          ...(input.kind ? { kind: input.kind === 'REMINDER' ? 'REMINDER' : 'APPOINTMENT' } : {}),
          ...(input.description !== undefined ? { description: clean(input.description, EVENT_TEXT_MAX) } : {}),
          ...(where
            ? {
                location: clean(where.location, 200),
                meetingUrl: where.meetingUrl,
                meetingMode: where.mode,
                placeKind: where.place,
                placeSpaceId: where.placeSpaceId,
                room: where.room,
                phone: where.phone,
                callDirection: where.callDirection,
              }
            : {}),
          ...(input.visibility ? { visibility: input.visibility === 'DETAILS' ? 'DETAILS' : 'BUSY' } : {}),
        },
      });
      if (removed.length) await tx.calendarAttendee.deleteMany({ where: { eventId: ev.id, userId: { in: removed } } });
      if (added.length) {
        await tx.calendarAttendee.createMany({
          data: added.map((userId) => ({
            eventId: ev.id,
            userId,
            organizationId: dto.organizationId,
            nextRemindAt: next?.at ?? null,
            remindOccurrence: next?.occurrence ?? null,
          })),
          skipDuplicates: true,
        });
      }
      if (remindersChanged) {
        // A moved time re-plans every reminder; anybody who declined stays quiet.
        await tx.calendarAttendee.updateMany({
          where: { eventId: ev.id, response: { not: 'DECLINED' } },
          data: { nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null },
        });
      }
      if (timesChanged) {
        // A new time is a new question: everybody but the organizer answers again.
        await tx.calendarAttendee.updateMany({
          where: { eventId: ev.id, isOrganizer: false, response: { not: 'PENDING' } },
          data: { response: 'PENDING', respondedAt: null },
        });
      }
    });
    const stayed = [...before].filter((id) => !removed.includes(id));
    const organizerName = added.length || removed.length ? await this.nameOf(dto.userId) : '';
    if (added.length)
      this.notify('calendar_invited', {
        organizationId: dto.organizationId,
        eventId: ev.id,
        title,
        startAt: startAt.toISOString(),
        allDay,
        timezone: tz,
        organizerId: dto.userId,
        organizerName,
        userIds: added,
      });
    if (timesChanged && stayed.length)
      this.notify('calendar_updated', {
        organizationId: dto.organizationId,
        eventId: ev.id,
        title,
        startAt: startAt.toISOString(),
        allDay,
        timezone: tz,
        organizerId: dto.userId,
        userIds: stayed,
      });
    if (removed.length)
      this.notify('calendar_canceled', {
        organizationId: dto.organizationId,
        eventId: ev.id,
        title,
        startAt: startAt.toISOString(),
        allDay,
        timezone: tz,
        organizerId: dto.userId,
        organizerName,
        userIds: removed,
      });
    this.refresh(dto.organizationId, [dto.userId, ...stayed, ...added, ...removed]);
    return this.get({ ...dto, eventId: ev.id });
  }
}
