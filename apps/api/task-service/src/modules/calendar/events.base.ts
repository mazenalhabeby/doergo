import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  notEndedWhere,
  EVENT_MAX_ATTENDEES,
  PrismaService,
  SERVICE_NAMES,
  isAdmin,
  cleanPhone,
  meetingFieldsFor,
  CALL_DIRECTIONS,
  MEETING_MODES,
  PLACE_KINDS,
  ROOM_MAX,
  type MeetingFields,
  success,
  personNameById,
  crmReachSelect,
  crmReachOfRow,
  crmReachesClientIn,
} from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';
import { Caller, clean } from './events-helpers';

/**
 * What the calendar-event services share: the organization's zone, who may be
 * invited, telling people, one event as its reader may see it, and the events in a
 * window.
 */
@Injectable()
export abstract class EventsBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) protected readonly notifications: ClientProxy,
  ) {}

  // ─── validation ───────────────────────────────────────────────────────────

  protected async orgZone(organizationId: string): Promise<string> {
    const o = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
    return o?.timezone || 'Europe/Vienna';
  }

  protected meetingUrl(v: unknown): string | null {
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

  /**
   * How and where, as it will be saved. One rule (`meetingFieldsFor`) drops what the mode does not
   * use; this adds what only the server may decide:
   *  - OUR OFFICE is a workspace of this organization the caller works in (or anyone, for those who
   *    see the whole organization), and its ADDRESS comes from the workspace — never from the form.
   *  - the CLIENT'S SITE needs a client (and so CRM access, checked by assertRefs) and an address.
   *  - a phone number must look like one; a link must be a web address.
   * A reminder has no place at all.
   */
  protected async meeting(
    caller: Caller,
    kind: 'APPOINTMENT' | 'REMINDER',
    f: MeetingFields,
    customerId: string | null,
  ): Promise<MeetingFields> {
    if (kind === 'REMINDER') return meetingFieldsFor({ ...f, mode: null, location: null, meetingUrl: null });
    const mode = f.mode && (MEETING_MODES as readonly string[]).includes(f.mode) ? f.mode : null;
    const place = f.place && (PLACE_KINDS as readonly string[]).includes(f.place) ? f.place : null;
    const out = meetingFieldsFor({
      ...f, mode, place,
      callDirection: f.callDirection && (CALL_DIRECTIONS as readonly string[]).includes(f.callDirection) ? f.callDirection : null,
    });
    // Any link that survives the mode is checked — an event without a mode keeps one too.
    if (out.meetingUrl) out.meetingUrl = this.meetingUrl(out.meetingUrl);
    if (out.mode === 'PHONE' && out.phone) {
      const ph = cleanPhone(out.phone);
      if (!ph) throw new BadRequestException({ code: 'EVENT_PHONE_INVALID', message: 'That does not look like a phone number.' });
      out.phone = ph;
    }
    if (out.mode === 'IN_PERSON') {
      out.location = clean(out.location, 200);
      if (out.place === 'OFFICE') {
        if (!out.placeSpaceId) throw new BadRequestException({ code: 'EVENT_OFFICE_REQUIRED', message: 'Choose which office.' });
        const s = await this.prisma.companyLocation.findFirst({
          where: { id: out.placeSpaceId, organizationId: caller.organizationId, isActive: true, isRemote: false },
          select: { id: true, address: true, name: true },
        });
        if (!s) throw new BadRequestException({ code: 'EVENT_OFFICE_UNKNOWN', message: 'That office is not one of yours.' });
        const wide = isAdmin({ role: caller.role } as any) || caller.canManageUsers || caller.orgWideView;
        if (!wide && !(await this.rules.workspacesOf(caller.organizationId, caller.userId)).includes(s.id)) {
          throw new ForbiddenException({ code: 'EVENT_OFFICE_NOT_YOURS', message: 'You can meet at a workspace you work in.' });
        }
        out.location = s.address || s.name;
        out.room = clean(out.room, ROOM_MAX);
      } else if (out.place === 'CLIENT_SITE') {
        if (!customerId) throw new BadRequestException({ code: 'EVENT_CLIENT_REQUIRED', message: 'Choose the client.' });
        if (!out.location) throw new BadRequestException({ code: 'EVENT_ADDRESS_REQUIRED', message: 'Choose or type the address.' });
      }
    }
    return out;
  }

  /** The colleagues this caller may put on an event: people they share a workspace with. */
  protected async inviteable(
    caller: Caller,
    ids: string[],
  ): Promise<Map<string, { id: string; firstName: string; lastName: string }>> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id && id !== caller.userId))].slice(
      0,
      EVENT_MAX_ATTENDEES + 1,
    );
    if (unique.length > EVENT_MAX_ATTENDEES)
      throw new BadRequestException({
        code: 'EVENT_TOO_MANY_PEOPLE',
        message: `At most ${EVENT_MAX_ATTENDEES} people.`,
      });
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
  protected async circleOf(caller: Caller): Promise<Set<string>> {
    const mine = await this.rules.workspacesOf(caller.organizationId, caller.userId);
    if (!mine.length) {
      const loose = await this.prisma.user.findMany({
        where: { organizationId: caller.organizationId, isActive: true, isExternal: false, role: { not: 'CUSTOMER' }, spaceAssignments: { none: {} } },
        select: { id: true },
      });
      return new Set(loose.map((u) => u.id));
    }
    const rows = await this.prisma.spaceAssignment.findMany({
      where: { organizationId: caller.organizationId, spaceId: { in: mine }, ...notEndedWhere() },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  /**
   * The event's client, as THIS viewer may see it — or null.
   *
   * "Reads the client book" (`crm`) was the whole test, so a rep with
   * own-scope CRM invited by another rep read the name of a client that is not
   * theirs. Now the CRM's own reach rule (crm/client-reach.ts): all-scope sees
   * it, own-scope only a client they own or co-manage. The organizer is asked
   * the same — handing a meeting over does not hand over the client.
   */
  protected async clientShownTo(
    caller: Caller,
    client: { id: string; name: string; spaceId?: string | null; ownerId: string | null; managerIds: string[] } | null,
  ): Promise<{ id: string; name: string } | null> {
    if (!client || !caller.crm) return null;
    if (caller.role === 'ADMIN') return { id: client.id, name: client.name };
    // Org-wide CRM, or a CRM grant in the workspace the client is filed in (crm/crm-reach.ts).
    const row = await this.prisma.user.findFirst({ where: { id: caller.userId, organizationId: caller.organizationId }, select: crmReachSelect() });
    return crmReachesClientIn(crmReachOfRow(row as never), client, caller.userId) ? { id: client.id, name: client.name } : null;
  }

  /** One shared rule for a name (people/person-name.ts) — never "John null". */
  protected nameOf(userId: string): Promise<string> {
    return personNameById(this.prisma as never, userId);
  }

  protected notify(pattern: string, payload: Record<string, unknown>) {
    this.notifications.emit(pattern, payload);
  }

  /** Tell the people on an event their calendars changed (live refresh, no push). */
  protected refresh(organizationId: string, userIds: string[]) {
    if (userIds.length) this.notify('calendar_changed', { organizationId, userIds: [...new Set(userIds)] });
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  async get(dto: Caller & { eventId: string }) {
    const ev = await this.prisma.calendarEvent.findFirst({
      where: { id: dto.eventId, organizationId: dto.organizationId, attendees: { some: { userId: dto.userId } } },
      include: {
        attendees: { select: { userId: true, response: true, isOrganizer: true, user: { select: { firstName: true, lastName: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' } },
        customer: { select: { id: true, name: true, spaceId: true, ownerId: true, managerIds: true } },
        space: { select: { id: true, name: true } },
        placeSpace: { select: { id: true, name: true, address: true, lat: true, lng: true } },
      },
    });
    if (!ev) throw new NotFoundException('Not found');
    const me = ev.attendees.find((a) => a.userId === dto.userId)!;
    const customer = await this.clientShownTo(dto, ev.customer);
    return success({
      id: ev.id, kind: ev.kind, title: ev.title, description: ev.description, location: ev.location, meetingUrl: ev.meetingUrl,
      startAt: ev.startAt.toISOString(), endAt: ev.endAt.toISOString(), allDay: ev.allDay, timezone: ev.timezone,
      repeat: ev.repeat ?? null, reminders: ev.reminderOffsets, visibility: ev.visibility, canceled: !!ev.canceledAt,
      space: ev.space, customer,
      meetingMode: ev.meetingMode, placeKind: ev.placeKind, placeSpace: ev.placeSpace, room: ev.room,
      phone: ev.phone, callDirection: ev.callDirection,
      organizerId: ev.createdById, canEdit: ev.createdById === dto.userId, myResponse: me.response,
      attendees: ev.attendees.map((a) => ({
        userId: a.userId, response: a.response, isOrganizer: a.isOrganizer,
        firstName: a.user.firstName, lastName: a.user.lastName, avatarUrl: a.user.avatarUrl,
      })),
    });
  }

  /**
   * Events overlapping a window for these people. Not declined, not canceled.
   *
   * Asked from the ATTENDEE side (indexed by person) and ordered, so it reads a person's own few
   * events rather than walking the organization's whole history, and a cap drops the furthest
   * future rather than an arbitrary few.
   */
  protected async eventsFor(organizationId: string, userIds: string[], from: Date, to: Date, includeDeclined = false) {
    const rows = await this.prisma.calendarAttendee.findMany({
      where: {
        organizationId,
        userId: { in: userIds },
        ...(includeDeclined ? {} : { response: { not: 'DECLINED' } }),
        event: { canceledAt: null, startAt: { lt: to }, OR: [{ seriesEndAt: null }, { seriesEndAt: { gt: from } }] },
      },
      select: { eventId: true },
      orderBy: { event: { startAt: 'asc' } },
      take: 2000,
    });
    const ids = [...new Set(rows.map((r) => r.eventId))].slice(0, 1000);
    if (!ids.length) return [];
    return this.prisma.calendarEvent.findMany({
      where: { id: { in: ids } },
      include: {
        attendees: { where: { userId: { in: userIds } }, select: { userId: true, response: true, isOrganizer: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startAt: 'asc' },
    });
  }
}
