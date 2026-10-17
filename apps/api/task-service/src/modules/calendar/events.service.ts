import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EVENT_MAX_DURATION_DAYS,
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  addDaysStr,
  firstReminder,
  localPartsIn,
  parseReminderOffsets,
  parseRepeat,
  success,
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
  reminderEventOf,
  seriesEndOf,
} from './events-helpers';
import { EventsBase } from './events.base';

export { type Caller, type EventInput, reminderEventOf, seriesEndOf } from './events-helpers';

/**
 * Appointments and reminders — the organization's own calendar.
 *
 * Who sees an event: the people ON it (the organizer included). Nobody else reads it, and an
 * event somebody cannot see is a 404, not a 403. Who may put a colleague on it: somebody they
 * share a workspace with (or anybody, for an administrator / a member who views all work).
 */
@Injectable()
export class EventsService extends EventsBase {
  /** The times of an event, read and checked. */
  private times(input: EventInput, tz: string, current?: EventRow) {
    const allDay = input.allDay ?? current?.allDay ?? false;
    let startAt: Date, endAt: Date;
    if (allDay) {
      const sd = input.startDate ?? (current ? localPartsIn(current.startAt, tz).dateStr : undefined);
      // A PATCH without an end keeps the end it had — falling back to the start shrank a 5-day event to 1.
      const ed = input.endDate ?? (current && current.allDay && !input.startDate ? localPartsIn(new Date(current.endAt.getTime() - 1), tz).dateStr : sd);
      if (!sd || !DATE.test(sd) || !ed || !DATE.test(ed) || ed < sd) throw new BadRequestException({ code: 'EVENT_TIME_INVALID', message: 'Choose a start day on or before the end day.' });
      startAt = zonedWallTimeToUtc(sd, 0, 0, tz);
      endAt = zonedWallTimeToUtc(addDaysStr(ed, 1), 0, 0, tz);
    } else {
      const s = input.startAt ?? current?.startAt.toISOString();
      const e = input.endAt ?? current?.endAt.toISOString();
      if (!s || !e || !ISO.test(s) || !ISO.test(e)) throw new BadRequestException({ code: 'EVENT_TIME_INVALID', message: 'Choose when it starts and ends.' });
      startAt = new Date(s);
      endAt = new Date(e);
      if (!(endAt.getTime() > startAt.getTime())) throw new BadRequestException({ code: 'EVENT_TIME_INVALID', message: 'It must end after it starts.' });
    }
    if (endAt.getTime() - startAt.getTime() > EVENT_MAX_DURATION_DAYS * DAY) {
      throw new BadRequestException({ code: 'EVENT_TOO_LONG', message: `An appointment lasts at most ${EVENT_MAX_DURATION_DAYS} days.` });
    }
    const year = startAt.getUTCFullYear();
    if (year < 2000 || year > 2200) throw new BadRequestException({ code: 'EVENT_TIME_INVALID', message: 'That date is out of range.' });
    return { allDay, startAt, endAt };
  }

  private async assertRefs(caller: Caller, spaceId: string | null, customerId: string | null) {
    if (spaceId) {
      const s = await this.prisma.companyLocation.findFirst({ where: { id: spaceId, organizationId: caller.organizationId }, select: { id: true } });
      if (!s) throw new BadRequestException('Workspace not found');
    }
    if (customerId) {
      if (!caller.crm) throw new ForbiddenException({ code: 'EVENT_CLIENT_NOT_ALLOWED', message: 'Only somebody who works with clients can put one on an event.' });
      const c = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId: caller.organizationId }, select: { id: true } });
      if (!c) throw new BadRequestException('Client not found');
    }
  }

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
      const prior = await this.prisma.calendarEvent.findUnique({ where: { id: clientId }, select: { createdById: true, organizationId: true } });
      if (prior) {
        if (prior.createdById !== dto.userId || prior.organizationId !== dto.organizationId) throw new ConflictException('That id is taken');
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
        repeat: (repeat as any) ?? undefined,
        seriesEndAt: seriesEndOf(startAt, endAt, repeat, tz),
        reminderOffsets: offsets,
        visibility: input.visibility === 'DETAILS' ? 'DETAILS' : 'BUSY',
        attendees: {
          create: [
            { userId: dto.userId, organizationId: dto.organizationId, isOrganizer: true, response: 'ACCEPTED', respondedAt: now, nextRemindAt: first?.at ?? null, remindOccurrence: first?.occurrence ?? null },
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

  private async loadForOrganizer(caller: Caller, eventId: string) {
    const ev = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, organizationId: caller.organizationId, canceledAt: null },
      include: { attendees: { select: { id: true, userId: true, response: true, isOrganizer: true } } },
    });
    if (!ev || !ev.attendees.some((a) => a.userId === caller.userId)) throw new NotFoundException('Not found');
    if (ev.createdById !== caller.userId) throw new ForbiddenException({ code: 'EVENT_NOT_ORGANIZER', message: 'Only the person who made it can change it.' });
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
      throw new BadRequestException({ code: (e as Error).message, message: 'The repeat or reminder settings are not valid.' });
    }
    /*
      A CHANGE of time is a new question for everybody — but only when the values differ. A form
      sends every field on every save; reading "the key was present" as "it changed" reset every
      answer and re-sent "moved" to everyone over a typo fixed in the title.
    */
    const timesChanged = startAt.getTime() !== ev.startAt.getTime() || endAt.getTime() !== ev.endAt.getTime()
      || allDay !== ev.allDay || tz !== ev.timezone || JSON.stringify(repeat ?? null) !== JSON.stringify(ev.repeat ?? null);
    const title = input.title !== undefined ? clean(input.title, EVENT_TITLE_MAX) : ev.title;
    if (!title) throw new BadRequestException({ code: 'EVENT_TITLE_REQUIRED', message: 'Give it a title.' });
    const spaceId = input.spaceId !== undefined ? input.spaceId || null : ev.spaceId;
    const customerId = input.customerId !== undefined ? input.customerId || null : ev.customerId;
    await this.assertRefs(dto, spaceId, customerId);
    const kindNext = input.kind ? (input.kind === 'REMINDER' ? 'REMINDER' : 'APPOINTMENT') : ev.kind;
    // How and where are recomputed together whenever any of them is sent (a mode switch clears the rest).
    const touched = MEETING_KEYS.some((k) => input[k] !== undefined) || input.kind !== undefined || input.customerId !== undefined;
    const pick = <T,>(k: (typeof MEETING_KEYS)[number], prev: T): T => (input[k] !== undefined ? (input[k] as unknown as T) : prev);
    const where = touched
      ? await this.meeting(dto, kindNext, {
          mode: pick('meetingMode', ev.meetingMode), place: pick('placeKind', ev.placeKind), placeSpaceId: pick('placeSpaceId', ev.placeSpaceId),
          room: pick('room', ev.room), location: pick('location', ev.location), meetingUrl: pick('meetingUrl', ev.meetingUrl),
          phone: pick('phone', ev.phone), callDirection: pick('callDirection', ev.callDirection),
        }, customerId)
      : null;

    const before = new Set(ev.attendees.filter((a) => !a.isOrganizer).map((a) => a.userId));
    let added: string[] = [], removed: string[] = [];
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
          title, spaceId, customerId, startAt, endAt, allDay, timezone: tz,
          repeat: (repeat as any) ?? null,
          seriesEndAt: seriesEndOf(startAt, endAt, repeat, tz),
          reminderOffsets: offsets,
          ...(input.kind ? { kind: input.kind === 'REMINDER' ? 'REMINDER' : 'APPOINTMENT' } : {}),
          ...(input.description !== undefined ? { description: clean(input.description, EVENT_TEXT_MAX) } : {}),
          ...(where ? {
            location: clean(where.location, 200), meetingUrl: where.meetingUrl, meetingMode: where.mode, placeKind: where.place,
            placeSpaceId: where.placeSpaceId, room: where.room, phone: where.phone, callDirection: where.callDirection,
          } : {}),
          ...(input.visibility ? { visibility: input.visibility === 'DETAILS' ? 'DETAILS' : 'BUSY' } : {}),
        },
      });
      if (removed.length) await tx.calendarAttendee.deleteMany({ where: { eventId: ev.id, userId: { in: removed } } });
      if (added.length) {
        await tx.calendarAttendee.createMany({
          data: added.map((userId) => ({ eventId: ev.id, userId, organizationId: dto.organizationId, nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null })),
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
        await tx.calendarAttendee.updateMany({ where: { eventId: ev.id, isOrganizer: false, response: { not: 'PENDING' } }, data: { response: 'PENDING', respondedAt: null } });
      }
    });
    const stayed = [...before].filter((id) => !removed.includes(id));
    const organizerName = added.length || removed.length ? await this.nameOf(dto.userId) : '';
    if (added.length) this.notify('calendar_invited', { organizationId: dto.organizationId, eventId: ev.id, title, startAt: startAt.toISOString(), allDay, timezone: tz, organizerId: dto.userId, organizerName, userIds: added });
    if (timesChanged && stayed.length) this.notify('calendar_updated', { organizationId: dto.organizationId, eventId: ev.id, title, startAt: startAt.toISOString(), allDay, timezone: tz, organizerId: dto.userId, userIds: stayed });
    if (removed.length) this.notify('calendar_canceled', { organizationId: dto.organizationId, eventId: ev.id, title, startAt: startAt.toISOString(), allDay, timezone: tz, organizerId: dto.userId, organizerName, userIds: removed });
    this.refresh(dto.organizationId, [dto.userId, ...stayed, ...added, ...removed]);
    return this.get({ ...dto, eventId: ev.id });
  }

  async cancel(dto: Caller & { eventId: string }) {
    const ev = await this.loadForOrganizer(dto, dto.eventId);
    await this.prisma.$transaction([
      this.prisma.calendarEvent.update({ where: { id: ev.id }, data: { canceledAt: new Date() } }),
      this.prisma.calendarAttendee.updateMany({ where: { eventId: ev.id }, data: { nextRemindAt: null } }),
    ]);
    const others = ev.attendees.filter((a) => !a.isOrganizer && a.response !== 'DECLINED').map((a) => a.userId);
    if (others.length) this.notify('calendar_canceled', { organizationId: dto.organizationId, eventId: ev.id, title: ev.title, startAt: ev.startAt.toISOString(), allDay: ev.allDay, timezone: ev.timezone, organizerId: dto.userId, organizerName: await this.nameOf(dto.userId), userIds: others });
    this.refresh(dto.organizationId, ev.attendees.map((a) => a.userId));
    return success({ ok: true });
  }
}
