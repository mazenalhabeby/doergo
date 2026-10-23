import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  PrismaService,
  firstReminder,
  parseReminderOffsets,
  parseRepeat,
  type Repeat,
} from '@hbcfield/shared';
import { Caller, EventInput, MEETING_KEYS, EventRow, validZone, clean, seriesEndOf } from './events-helpers';
import { EventChecksService } from './event-checks.service';
import { EventNoticesService } from './event-notices.service';
import { EventPeopleService } from './event-people.service';
import { eventTimes } from './event-times';
import type { Prisma } from '@prisma/client';

/**
 * Changing an event: its times, how and where, who is on it — and who is told what. A new time is
 * a new question for everybody; reminders are re-planned in the same transaction.
 */
@Injectable()
export class EventUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checks: EventChecksService,
    private readonly people: EventPeopleService,
    private readonly notices: EventNoticesService,
  ) {}

  /** Change an event; answers the id of the event changed (the caller reads it back for its reader). */
  async update(dto: Caller & { eventId: string; input: EventInput }): Promise<string> {
    const ev = await this.checks.loadForOrganizer(dto, dto.eventId);
    const input = dto.input ?? {};
    const tz = input.timezone !== undefined ? (validZone(input.timezone) ? input.timezone : ev.timezone) : ev.timezone;
    const { allDay, startAt, endAt } = eventTimes(input, tz, ev as unknown as EventRow);
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
    await this.checks.assertRefs(dto, spaceId, customerId);
    const kindNext = input.kind ? (input.kind === 'REMINDER' ? 'REMINDER' : 'APPOINTMENT') : ev.kind;
    // How and where are recomputed together whenever any of them is sent (a mode switch clears the rest).
    const touched =
      MEETING_KEYS.some((k) => input[k] !== undefined) || input.kind !== undefined || input.customerId !== undefined;
    const pick = <T>(k: (typeof MEETING_KEYS)[number], prev: T): T =>
      input[k] !== undefined ? (input[k] as unknown as T) : prev;
    const where = touched
      ? await this.checks.meeting(
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
      const wanted = await this.people.inviteable(dto, input.attendeeIds);
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
    const organizerName = added.length || removed.length ? await this.notices.nameOf(dto.userId) : '';
    if (added.length)
      this.notices.notify('calendar_invited', {
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
      this.notices.notify('calendar_updated', {
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
      this.notices.notify('calendar_canceled', {
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
    this.notices.refresh(dto.organizationId, [dto.userId, ...stayed, ...added, ...removed]);
    return ev.id;
  }
}
