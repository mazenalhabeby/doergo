import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  firstReminder,
  parseReminderOffsets,
  parseRepeat,
  success,
  type Repeat,
} from '@hbcfield/shared';
import { Caller, EventInput, validZone, clean, reminderEventOf, seriesEndOf } from './events-helpers';
import { EventsUpdateBase } from './events-update.base';
import type { Prisma } from '@prisma/client';

export { type Caller, type EventInput, reminderEventOf, seriesEndOf } from './events-helpers';

/**
 * Appointments and reminders — the organization's own calendar.
 *
 * Who sees an event: the people ON it (the organizer included). Nobody else reads it, and an
 * event somebody cannot see is a 404, not a 403. Who may put a colleague on it: somebody they
 * share a workspace with (or anybody, for an administrator / a member who views all work).
 */
@Injectable()
export class EventsService extends EventsUpdateBase {

  // ─── writes ───────────────────────────────────────────────────────────────

  async create(dto: Caller & { input: EventInput; clientId?: string }) {
    const input = dto.input ?? {};
    const title = clean(input.title, EVENT_TITLE_MAX);
    if (!title) throw new BadRequestException({ code: 'EVENT_TITLE_REQUIRED', message: 'Give it a title.' });
    const tz = validZone(input.timezone) ? input.timezone : await this.orgZone(dto.organizationId);
    const { allDay, startAt, endAt } = this.times(input, tz);
    let repeat: Repeat | null, offsets: number[];
    try {
      repeat = parseRepeat(input.repeat);
      offsets = parseReminderOffsets(input.reminders);
    } catch (e) {
      throw new BadRequestException({ code: (e as Error).message, message: 'The repeat or reminder settings are not valid.' });
    }
    const spaceId = input.spaceId || null;
    const customerId = input.customerId || null;
    await this.assertRefs(dto, spaceId, customerId);
    const invitees = await this.inviteable(dto, input.attendeeIds ?? []);
    const kind = input.kind === 'REMINDER' ? 'REMINDER' : 'APPOINTMENT';
    const where = await this.meeting(dto, kind, {
      mode: input.meetingMode ?? null, place: input.placeKind ?? null, placeSpaceId: input.placeSpaceId ?? null,
      room: input.room ?? null, location: input.location ?? null, meetingUrl: input.meetingUrl ?? null,
      phone: input.phone ?? null, callDirection: input.callDirection ?? null,
    }, customerId);
    const ev = { startAt, endAt, repeat, timezone: tz, reminderOffsets: offsets };
    const now = new Date();
    const first = firstReminder(reminderEventOf(ev), now);

    // The same request sent twice (a phone retrying) is answered with the event it already made.
    const clientId = dto.clientId && /^[A-Za-z0-9_-]{8,40}$/.test(dto.clientId) ? dto.clientId : null;
    if (clientId) {
      const prior = await this.prisma.calendarEvent.findUnique({
        where: { id: clientId },
        select: { createdById: true, organizationId: true },
      });
      if (prior) {
        if (prior.createdById !== dto.userId || prior.organizationId !== dto.organizationId)
          throw new ConflictException('That id is taken');
        return this.get({ ...dto, eventId: clientId });
      }
    }
    const created = await this.prisma.calendarEvent.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        organizationId: dto.organizationId,
        createdById: dto.userId,
        spaceId, customerId, kind, title,
        description: clean(input.description, EVENT_TEXT_MAX),
        location: clean(where.location, 200),
        meetingUrl: where.meetingUrl,
        meetingMode: where.mode, placeKind: where.place, placeSpaceId: where.placeSpaceId,
        room: where.room, phone: where.phone, callDirection: where.callDirection,
        startAt, endAt, allDay, timezone: tz,
        repeat: (repeat as unknown as Prisma.InputJsonValue) ?? undefined,
        seriesEndAt: seriesEndOf(startAt, endAt, repeat, tz),
        reminderOffsets: offsets,
        visibility: input.visibility === 'DETAILS' ? 'DETAILS' : 'BUSY',
        attendees: {
          create: [
            {
              userId: dto.userId,
              organizationId: dto.organizationId,
              isOrganizer: true,
              response: 'ACCEPTED',
              respondedAt: now,
              nextRemindAt: first?.at ?? null,
              remindOccurrence: first?.occurrence ?? null,
            },
            ...[...invitees.keys()].map((userId) => ({
              userId, organizationId: dto.organizationId, response: 'PENDING' as const,
              nextRemindAt: first?.at ?? null, remindOccurrence: first?.occurrence ?? null,
            })),
          ],
        },
      },
      select: { id: true },
    });
    if (invitees.size) {
      this.notify('calendar_invited', {
        organizationId: dto.organizationId, eventId: created.id, title, startAt: startAt.toISOString(), allDay,
        timezone: tz, organizerId: dto.userId, organizerName: await this.nameOf(dto.userId), userIds: [...invitees.keys()],
      });
    }
    this.refresh(dto.organizationId, [dto.userId, ...invitees.keys()]);
    return this.get({ ...dto, eventId: created.id });
  }

  async cancel(dto: Caller & { eventId: string }) {
    const ev = await this.loadForOrganizer(dto, dto.eventId);
    await this.prisma.$transaction([
      this.prisma.calendarEvent.update({ where: { id: ev.id }, data: { canceledAt: new Date() } }),
      this.prisma.calendarAttendee.updateMany({ where: { eventId: ev.id }, data: { nextRemindAt: null } }),
    ]);
    const others = ev.attendees.filter((a) => !a.isOrganizer && a.response !== 'DECLINED').map((a) => a.userId);
    if (others.length)
      this.notify('calendar_canceled', {
        organizationId: dto.organizationId,
        eventId: ev.id,
        title: ev.title,
        startAt: ev.startAt.toISOString(),
        allDay: ev.allDay,
        timezone: ev.timezone,
        organizerId: dto.userId,
        organizerName: await this.nameOf(dto.userId),
        userIds: others,
      });
    this.refresh(
      dto.organizationId,
      ev.attendees.map((a) => a.userId),
    );
    return success({ ok: true });
  }
}
