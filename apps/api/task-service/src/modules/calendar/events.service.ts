import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  EVENT_MAX_ATTENDEES,
  EVENT_MAX_DURATION_DAYS,
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  PrismaService,
  SERVICE_NAMES,
  SNOOZE_MINUTES,
  addDaysStr,
  dayKind,
  findFreeSlots,
  firstReminder,
  isAdmin,
  localPartsIn,
  nextReminder,
  occurrences,
  parseReminderOffsets,
  parseRepeat,
  success,
  zonedWallTimeToUtc,
  type CalendarItem,
  type Repeat,
  type ReminderEvent,
  type RsvpResponse,
} from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The caller, as the gateway resolved it from the token — never from the body. */
export interface Caller {
  userId: string;
  organizationId: string;
  role?: string;
  canManageUsers?: boolean;
  /** Org-wide canViewAllTasks — may invite anybody in the organization. */
  orgWideView?: boolean;
}

export interface EventInput {
  kind?: 'APPOINTMENT' | 'REMINDER';
  title?: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  customerId?: string | null;
  spaceId?: string | null;
  allDay?: boolean;
  /** Timed: ISO instants. */
  startAt?: string;
  endAt?: string;
  /** All-day: local dates, end inclusive. */
  startDate?: string;
  endDate?: string;
  timezone?: string;
  repeat?: unknown;
  reminders?: unknown;
  visibility?: 'BUSY' | 'DETAILS';
  attendeeIds?: string[];
}

type EventRow = {
  id: string; organizationId: string; spaceId: string | null; createdById: string; kind: 'APPOINTMENT' | 'REMINDER';
  title: string; description: string | null; location: string | null; meetingUrl: string | null; customerId: string | null;
  startAt: Date; endAt: Date; allDay: boolean; timezone: string; repeat: unknown; seriesEndAt: Date | null;
  reminderOffsets: number[]; visibility: 'BUSY' | 'DETAILS'; canceledAt: Date | null;
};

function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function clean(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

export function reminderEventOf(ev: Pick<EventRow, 'startAt' | 'endAt' | 'repeat' | 'timezone' | 'reminderOffsets'>): ReminderEvent {
  return { startAt: ev.startAt, endAt: ev.endAt, repeat: (ev.repeat as Repeat | null) ?? null, timezone: ev.timezone, offsets: ev.reminderOffsets };
}

/** When the last occurrence ends — NULL for a series without an end. */
export function seriesEndOf(startAt: Date, endAt: Date, repeat: Repeat | null, tz: string): Date | null {
  if (!repeat) return endAt;
  if (!repeat.until && !repeat.count) return null;
  const dur = endAt.getTime() - startAt.getTime();
  const to = repeat.until ? new Date(`${addDaysStr(repeat.until, 2)}T00:00:00Z`) : new Date('2999-12-31T00:00:00Z');
  const list = occurrences(startAt, dur, repeat, tz, startAt, to);
  const last = list[list.length - 1];
  return last ? new Date(last.getTime() + dur) : endAt;
}

/**
 * Appointments and reminders — the organization's own calendar.
 *
 * Who sees an event: the people ON it (the organizer included). Nobody else reads it, and an
 * event somebody cannot see is a 404, not a 403. Who may put a colleague on it: somebody they
 * share a workspace with (or anybody, for an administrator / a member who views all work).
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  // ─── validation ───────────────────────────────────────────────────────────

  private async orgZone(organizationId: string): Promise<string> {
    const o = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
    return o?.timezone || 'Europe/Vienna';
  }

  /** The times of an event, read and checked. */
  private times(input: EventInput, tz: string, current?: EventRow) {
    const allDay = input.allDay ?? current?.allDay ?? false;
    let startAt: Date, endAt: Date;
    if (allDay) {
      const sd = input.startDate ?? (current ? localPartsIn(current.startAt, tz).dateStr : undefined);
      const ed = input.endDate ?? sd;
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

  private meetingUrl(v: unknown): string | null {
    const s = clean(v, 500);
    if (!s) return null;
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new BadRequestException({ code: 'MEETING_URL_INVALID', message: 'The meeting link must be a web address (https://…).' });
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BadRequestException({ code: 'MEETING_URL_INVALID', message: 'The meeting link must be a web address (https://…).' });
    return u.toString();
  }

  /** The colleagues this caller may put on an event: people they share a workspace with. */
  private async inviteable(caller: Caller, ids: string[]): Promise<Map<string, { id: string; firstName: string; lastName: string }>> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id && id !== caller.userId))].slice(0, EVENT_MAX_ATTENDEES + 1);
    if (unique.length > EVENT_MAX_ATTENDEES) throw new BadRequestException({ code: 'EVENT_TOO_MANY_PEOPLE', message: `At most ${EVENT_MAX_ATTENDEES} people.` });
    if (!unique.length) return new Map();
    const people = await this.prisma.user.findMany({
      where: { id: { in: unique }, organizationId: caller.organizationId, isActive: true, isExternal: false, role: { not: 'CUSTOMER' } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (people.length !== unique.length) throw new BadRequestException({ code: 'EVENT_PERSON_UNKNOWN', message: 'Somebody on the list is not a colleague here.' });
    if (!(isAdmin({ role: caller.role } as any) || caller.canManageUsers || caller.orgWideView)) {
      const circle = await this.circleOf(caller);
      const outside = people.filter((p) => !circle.has(p.id));
      if (outside.length) throw new ForbiddenException({ code: 'EVENT_PERSON_NOT_REACHABLE', message: 'You can invite people you work with in a workspace.' });
    }
    return new Map(people.map((p) => [p.id, p]));
  }

  /** People who share a workspace with the caller — or, for somebody in none, everyone else in none. */
  private async circleOf(caller: Caller): Promise<Set<string>> {
    const mine = await this.rules.workspacesOf(caller.organizationId, caller.userId);
    if (!mine.length) {
      const loose = await this.prisma.user.findMany({
        where: { organizationId: caller.organizationId, isActive: true, isExternal: false, role: { not: 'CUSTOMER' }, spaceAssignments: { none: {} } },
        select: { id: true },
      });
      return new Set(loose.map((u) => u.id));
    }
    const rows = await this.prisma.spaceAssignment.findMany({
      where: { organizationId: caller.organizationId, spaceId: { in: mine }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  /** Colleagues for the invite picker — the same circle `inviteable` accepts. */
  async people(dto: Caller & { q?: string }) {
    const q = clean(dto.q, 60);
    const wide = isAdmin({ role: dto.role } as any) || dto.canManageUsers || dto.orgWideView;
    const circle = wide ? null : await this.circleOf(dto);
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: dto.organizationId, isActive: true, isExternal: false, role: { not: 'CUSTOMER' }, id: { not: dto.userId },
        ...(circle ? { id: { in: [...circle].filter((id) => id !== dto.userId) } } : {}),
        ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { position: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 30,
    });
    return success(rows);
  }

  private async assertRefs(caller: Caller, spaceId: string | null, customerId: string | null) {
    if (spaceId) {
      const s = await this.prisma.companyLocation.findFirst({ where: { id: spaceId, organizationId: caller.organizationId }, select: { id: true } });
      if (!s) throw new BadRequestException('Workspace not found');
    }
    if (customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId: caller.organizationId }, select: { id: true } });
      if (!c) throw new BadRequestException('Client not found');
    }
  }

  private async nameOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName} ${u.lastName}`.trim() : '';
  }

  private notify(pattern: string, payload: Record<string, unknown>) {
    this.notifications.emit(pattern, payload);
  }

  /** Tell the people on an event their calendars changed (live refresh, no push). */
  private refresh(organizationId: string, userIds: string[]) {
    if (userIds.length) this.notify('calendar_changed', { organizationId, userIds: [...new Set(userIds)] });
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
    const meetingUrl = this.meetingUrl(input.meetingUrl);
    const kind = input.kind === 'REMINDER' ? 'REMINDER' : 'APPOINTMENT';
    const ev = { startAt, endAt, repeat, timezone: tz, reminderOffsets: offsets };
    const now = new Date();
    const first = firstReminder(reminderEventOf(ev), now);

    const created = await this.prisma.calendarEvent.create({
      data: {
        ...(dto.clientId && /^[A-Za-z0-9_-]{8,40}$/.test(dto.clientId) ? { id: dto.clientId } : {}),
        organizationId: dto.organizationId,
        createdById: dto.userId,
        spaceId, customerId, kind, title,
        description: clean(input.description, EVENT_TEXT_MAX),
        location: clean(input.location, 200),
        meetingUrl,
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
    const timesChanged = ['allDay', 'startAt', 'endAt', 'startDate', 'endDate', 'timezone', 'repeat'].some((k) => (input as any)[k] !== undefined);
    const { allDay, startAt, endAt } = this.times(input, tz, ev as unknown as EventRow);
    let repeat: Repeat | null = (ev.repeat as Repeat | null) ?? null;
    let offsets = ev.reminderOffsets;
    try {
      if (input.repeat !== undefined) repeat = parseRepeat(input.repeat);
      if (input.reminders !== undefined) offsets = parseReminderOffsets(input.reminders);
    } catch (e) {
      throw new BadRequestException({ code: (e as Error).message, message: 'The repeat or reminder settings are not valid.' });
    }
    const title = input.title !== undefined ? clean(input.title, EVENT_TITLE_MAX) : ev.title;
    if (!title) throw new BadRequestException({ code: 'EVENT_TITLE_REQUIRED', message: 'Give it a title.' });
    const spaceId = input.spaceId !== undefined ? input.spaceId || null : ev.spaceId;
    const customerId = input.customerId !== undefined ? input.customerId || null : ev.customerId;
    await this.assertRefs(dto, spaceId, customerId);

    const before = new Set(ev.attendees.filter((a) => !a.isOrganizer).map((a) => a.userId));
    let added: string[] = [], removed: string[] = [];
    if (input.attendeeIds !== undefined) {
      const wanted = await this.inviteable(dto, input.attendeeIds);
      added = [...wanted.keys()].filter((id) => !before.has(id));
      removed = [...before].filter((id) => !wanted.has(id));
    }

    const remindersChanged = timesChanged || input.reminders !== undefined;
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
          ...(input.location !== undefined ? { location: clean(input.location, 200) } : {}),
          ...(input.meetingUrl !== undefined ? { meetingUrl: this.meetingUrl(input.meetingUrl) } : {}),
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

  private async myRow(caller: Caller, eventId: string) {
    const row = await this.prisma.calendarAttendee.findFirst({
      where: { eventId, userId: caller.userId, organizationId: caller.organizationId, event: { canceledAt: null } },
      include: { event: true },
    });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async respond(dto: Caller & { eventId: string; response: RsvpResponse }) {
    if (!['ACCEPTED', 'MAYBE', 'DECLINED'].includes(dto.response)) throw new BadRequestException('Answer accept, maybe or decline');
    const row = await this.myRow(dto, dto.eventId);
    if (row.isOrganizer) throw new BadRequestException({ code: 'EVENT_ORGANIZER_ANSWERS', message: 'You made it — you are going.' });
    const next = dto.response === 'DECLINED' ? null : nextReminder(reminderEventOf(row.event as unknown as EventRow), new Date());
    await this.prisma.calendarAttendee.update({
      where: { id: row.id },
      data: { response: dto.response, respondedAt: new Date(), nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null },
    });
    if (row.response !== dto.response) {
      this.notify('calendar_responded', {
        organizationId: dto.organizationId, eventId: row.eventId, title: row.event.title,
        organizerId: row.event.createdById, responderId: dto.userId, responderName: await this.nameOf(dto.userId), response: dto.response,
      });
    }
    this.refresh(dto.organizationId, [dto.userId, row.event.createdById]);
    return success({ response: dto.response });
  }

  /** "+10 min" on the reminder. */
  async snooze(dto: Caller & { eventId: string; minutes?: number }) {
    const row = await this.myRow(dto, dto.eventId);
    const minutes = [5, 10, 15, 30, 60].includes(Number(dto.minutes)) ? Number(dto.minutes) : SNOOZE_MINUTES;
    const at = new Date(Date.now() + minutes * 60000);
    await this.prisma.calendarAttendee.update({ where: { id: row.id }, data: { nextRemindAt: at, remindOccurrence: row.remindOccurrence ?? row.event.startAt } });
    return success({ nextRemindAt: at.toISOString() });
  }

  /** "Done" on the reminder: nothing more about this occurrence. */
  async done(dto: Caller & { eventId: string }) {
    const row = await this.myRow(dto, dto.eventId);
    const next = nextReminder(reminderEventOf(row.event as unknown as EventRow), new Date(), row.remindOccurrence);
    await this.prisma.calendarAttendee.update({ where: { id: row.id }, data: { nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null } });
    return success({ nextRemindAt: next?.at.toISOString() ?? null });
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  async get(dto: Caller & { eventId: string }) {
    const ev = await this.prisma.calendarEvent.findFirst({
      where: { id: dto.eventId, organizationId: dto.organizationId, attendees: { some: { userId: dto.userId } } },
      include: {
        attendees: { select: { userId: true, response: true, isOrganizer: true, user: { select: { firstName: true, lastName: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' } },
        customer: { select: { id: true, name: true } },
        space: { select: { id: true, name: true } },
      },
    });
    if (!ev) throw new NotFoundException('Not found');
    const me = ev.attendees.find((a) => a.userId === dto.userId)!;
    return success({
      id: ev.id, kind: ev.kind, title: ev.title, description: ev.description, location: ev.location, meetingUrl: ev.meetingUrl,
      startAt: ev.startAt.toISOString(), endAt: ev.endAt.toISOString(), allDay: ev.allDay, timezone: ev.timezone,
      repeat: ev.repeat ?? null, reminders: ev.reminderOffsets, visibility: ev.visibility, canceled: !!ev.canceledAt,
      space: ev.space, customer: ev.customer,
      organizerId: ev.createdById, canEdit: ev.createdById === dto.userId, myResponse: me.response,
      attendees: ev.attendees.map((a) => ({
        userId: a.userId, response: a.response, isOrganizer: a.isOrganizer,
        firstName: a.user.firstName, lastName: a.user.lastName, avatarUrl: a.user.avatarUrl,
      })),
    });
  }

  /** Events overlapping a window for these people. Not declined, not canceled. */
  private async eventsFor(organizationId: string, userIds: string[], from: Date, to: Date, includeDeclined = false) {
    return this.prisma.calendarEvent.findMany({
      where: {
        organizationId, canceledAt: null,
        startAt: { lt: to },
        OR: [{ seriesEndAt: null }, { seriesEndAt: { gt: from } }],
        attendees: { some: { userId: { in: userIds }, ...(includeDeclined ? {} : { response: { not: 'DECLINED' } }) } },
      },
      include: {
        attendees: { where: { userId: { in: userIds } }, select: { userId: true, response: true, isOrganizer: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      take: 1000,
    });
  }

  /** My events as calendar items, every occurrence in the window. */
  async itemsFor(caller: Caller, from: Date, to: Date): Promise<CalendarItem[]> {
    const rows = await this.eventsFor(caller.organizationId, [caller.userId], from, to, true);
    const out: CalendarItem[] = [];
    for (const ev of rows) {
      const mine = ev.attendees.find((a) => a.userId === caller.userId);
      const dur = ev.endAt.getTime() - ev.startAt.getTime();
      for (const s of occurrences(ev.startAt, dur, (ev.repeat as Repeat | null) ?? null, ev.timezone, from, to)) {
        const e = new Date(s.getTime() + dur);
        out.push({
          id: `${ev.id}:${s.toISOString()}`,
          kind: ev.kind === 'REMINDER' ? 'reminder' : 'event',
          layer: 'events',
          title: ev.title,
          start: ev.allDay ? localPartsIn(s, ev.timezone).dateStr : s.toISOString(),
          end: ev.allDay ? addDaysStr(localPartsIn(e, ev.timezone).dateStr, -1) : e.toISOString(),
          allDay: ev.allDay,
          spaceId: ev.spaceId,
          status: mine?.response ?? null,
          ref: { type: 'event', id: ev.id },
          location: ev.location,
          meetingUrl: ev.meetingUrl,
          note: mine?.isOrganizer ? null : `${ev.createdBy.firstName} ${ev.createdBy.lastName}`.trim(),
        });
        if (out.length >= 2000) return out;
      }
    }
    return out;
  }

  /**
   * Free / busy for colleagues around a time — the invite dialog's strips. Times only, never titles.
   */
  async availability(dto: Caller & { userIds: string[]; from: string; to: string }) {
    if (!ISO.test(dto.from ?? '') || !ISO.test(dto.to ?? '')) throw new BadRequestException('from and to are instants');
    const from = new Date(dto.from), to = new Date(dto.to);
    if (!(to > from) || to.getTime() - from.getTime() > 14 * DAY) throw new BadRequestException('At most two weeks at a time');
    const people = await this.inviteable(dto, (dto.userIds ?? []).slice(0, 20));
    const ids = [dto.userId, ...people.keys()];
    const [events, leave, users] = await Promise.all([
      this.eventsFor(dto.organizationId, ids, from, to),
      this.prisma.timeOff.findMany({
        where: { technicianId: { in: ids }, status: { in: ['APPROVED', 'PENDING'] }, startDate: { lte: to }, endDate: { gte: new Date(from.getTime() - DAY) } },
        select: { technicianId: true, startDate: true, endDate: true, status: true },
      }),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const tz = await this.orgZone(dto.organizationId);
    const fromKey = localPartsIn(from, tz).dateStr, toKey = localPartsIn(to, tz).dateStr;
    const out = [];
    for (const u of users) {
      const busy: { start: string; end: string }[] = [];
      for (const ev of events.filter((e) => e.attendees.some((a) => a.userId === u.id && a.response !== 'DECLINED'))) {
        const dur = ev.endAt.getTime() - ev.startAt.getTime();
        for (const s of occurrences(ev.startAt, dur, (ev.repeat as Repeat | null) ?? null, ev.timezone, from, to)) {
          busy.push({ start: s.toISOString(), end: new Date(s.getTime() + dur).toISOString() });
        }
      }
      const { rules, roster } = await this.rules.personRules(dto.organizationId, u.id, fromKey, toKey);
      const days: { day: string; kind: string; leave: 'APPROVED' | 'PENDING' | null }[] = [];
      for (let d = fromKey; d <= toKey; d = addDaysStr(d, 1)) {
        const l = leave.find((x) => x.technicianId === u.id && x.startDate.toISOString().slice(0, 10) <= d && x.endDate.toISOString().slice(0, 10) >= d);
        days.push({ day: d, kind: dayKind(d, rules, roster), leave: (l?.status as 'APPROVED' | 'PENDING') ?? null });
      }
      out.push({ userId: u.id, firstName: u.firstName, lastName: u.lastName, busy, days });
    }
    return success(out);
  }

  /** The next times everybody is free, inside working days and hours. */
  async freeSlots(dto: Caller & { userIds: string[]; durationMin: number; from?: string; days?: number; timezone?: string }) {
    const dur = Number(dto.durationMin);
    if (!Number.isInteger(dur) || dur < 5 || dur > 8 * 60) throw new BadRequestException('Duration 5 minutes to 8 hours');
    const days = Math.min(Math.max(Number(dto.days) || 10, 1), 30);
    const from = dto.from && ISO.test(dto.from) ? new Date(dto.from) : new Date();
    const start = new Date(Math.max(from.getTime(), Date.now()));
    const to = new Date(start.getTime() + days * DAY);
    const people = await this.inviteable(dto, (dto.userIds ?? []).slice(0, 20));
    const ids = [dto.userId, ...people.keys()];
    const tz = validZone(dto.timezone) ? dto.timezone : await this.orgZone(dto.organizationId);
    const fromKey = localPartsIn(start, tz).dateStr, toKey = localPartsIn(to, tz).dateStr;
    const [events, leave] = await Promise.all([
      this.eventsFor(dto.organizationId, ids, start, to),
      this.prisma.timeOff.findMany({
        where: { technicianId: { in: ids }, status: 'APPROVED', startDate: { lte: to }, endDate: { gte: start } },
        select: { technicianId: true, startDate: true, endDate: true },
      }),
    ]);
    const persons = await Promise.all(ids.map(async (id) => {
      const { rules, roster } = await this.rules.personRules(dto.organizationId, id, fromKey, toKey);
      const busy = events
        .filter((e) => e.attendees.some((a) => a.userId === id))
        .flatMap((ev) => {
          const d = ev.endAt.getTime() - ev.startAt.getTime();
          return occurrences(ev.startAt, d, (ev.repeat as Repeat | null) ?? null, ev.timezone, start, to).map((s) => ({ start: s, end: new Date(s.getTime() + d) }));
        });
      const myLeave = leave.filter((l) => l.technicianId === id);
      return {
        busy,
        works: (day: string) =>
          dayKind(day, rules, roster) === 'work'
          && !myLeave.some((l) => l.startDate.toISOString().slice(0, 10) <= day && l.endDate.toISOString().slice(0, 10) >= day),
      };
    }));
    const slots = findFreeSlots({ people: persons, timezone: tz, durationMin: dur, from: start, days, limit: 3 });
    return success(slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })));
  }

  // ─── the reminder sweep ───────────────────────────────────────────────────

  /**
   * Everything due, claimed row by row with a conditional write (two replicas never send twice),
   * then moved on to its next reminder. Bounded per run; the next minute takes the rest.
   */
  async sweepDue(now = new Date()): Promise<number> {
    const due = await this.prisma.calendarAttendee.findMany({
      where: { nextRemindAt: { lte: now } },
      include: { event: true },
      orderBy: { nextRemindAt: 'asc' },
      take: 200,
    });
    let sent = 0;
    for (const row of due) {
      const ev = row.event as unknown as EventRow;
      const stale = ev.canceledAt || row.response === 'DECLINED';
      const next = stale ? null : nextReminder(reminderEventOf(ev), now);
      const claimed = await this.prisma.calendarAttendee.updateMany({
        where: { id: row.id, nextRemindAt: row.nextRemindAt },
        data: { nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null },
      });
      if (claimed.count !== 1 || stale) continue;
      const occurrence = row.remindOccurrence ?? ev.startAt;
      // A reminder for something already over is dropped silently — the phone was off, not the person.
      if (occurrence.getTime() + Math.max(ev.endAt.getTime() - ev.startAt.getTime(), 0) < now.getTime()) continue;
      this.notify('calendar_reminder', {
        organizationId: ev.organizationId, userId: row.userId, eventId: ev.id, kind: ev.kind,
        title: ev.title, occurrence: occurrence.toISOString(), allDay: ev.allDay, timezone: ev.timezone,
        minutes: Math.max(0, Math.round((occurrence.getTime() - now.getTime()) / 60000)),
        meetingUrl: ev.meetingUrl,
      });
      sent++;
    }
    return sent;
  }
}
