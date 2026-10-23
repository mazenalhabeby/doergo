import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
  isAdmin,
  cleanPhone,
  meetingFieldsFor,
  CALL_DIRECTIONS,
  MEETING_MODES,
  PLACE_KINDS,
  ROOM_MAX,
  type MeetingFields,
  clientInOrg,
} from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';
import { Caller, clean } from './events-helpers';

/**
 * What creating or changing an event is checked against: its workspace and client, how and where
 * it happens (the server decides an office's address), and that only its organizer changes it.
 */
@Injectable()
export class EventChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CalendarRulesService,
  ) {}

  private meetingUrl(v: unknown): string | null {
    const s = clean(v, 500);
    if (!s) return null;
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new BadRequestException({
        code: 'MEETING_URL_INVALID',
        message: 'The meeting link must be a web address (https://…).',
      });
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
      throw new BadRequestException({
        code: 'MEETING_URL_INVALID',
        message: 'The meeting link must be a web address (https://…).',
      });
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
  async meeting(
    caller: Caller,
    kind: 'APPOINTMENT' | 'REMINDER',
    f: MeetingFields,
    customerId: string | null,
  ): Promise<MeetingFields> {
    if (kind === 'REMINDER') return meetingFieldsFor({ ...f, mode: null, location: null, meetingUrl: null });
    const mode = f.mode && (MEETING_MODES as readonly string[]).includes(f.mode) ? f.mode : null;
    const place = f.place && (PLACE_KINDS as readonly string[]).includes(f.place) ? f.place : null;
    const out = meetingFieldsFor({
      ...f,
      mode,
      place,
      callDirection:
        f.callDirection && (CALL_DIRECTIONS as readonly string[]).includes(f.callDirection) ? f.callDirection : null,
    });
    // Any link that survives the mode is checked — an event without a mode keeps one too.
    if (out.meetingUrl) out.meetingUrl = this.meetingUrl(out.meetingUrl);
    if (out.mode === 'PHONE' && out.phone) {
      const ph = cleanPhone(out.phone);
      if (!ph)
        throw new BadRequestException({
          code: 'EVENT_PHONE_INVALID',
          message: 'That does not look like a phone number.',
        });
      out.phone = ph;
    }
    if (out.mode === 'IN_PERSON') {
      out.location = clean(out.location, 200);
      if (out.place === 'OFFICE') {
        if (!out.placeSpaceId)
          throw new BadRequestException({ code: 'EVENT_OFFICE_REQUIRED', message: 'Choose which office.' });
        const s = await this.prisma.companyLocation.findFirst({
          where: { id: out.placeSpaceId, organizationId: caller.organizationId, isActive: true, isRemote: false },
          select: { id: true, address: true, name: true },
        });
        if (!s)
          throw new BadRequestException({ code: 'EVENT_OFFICE_UNKNOWN', message: 'That office is not one of yours.' });
        const wide = isAdmin({ role: caller.role as string }) || caller.canManageUsers || caller.orgWideView;
        if (!wide && !(await this.rules.workspacesOf(caller.organizationId, caller.userId)).includes(s.id)) {
          throw new ForbiddenException({
            code: 'EVENT_OFFICE_NOT_YOURS',
            message: 'You can meet at a workspace you work in.',
          });
        }
        out.location = s.address || s.name;
        out.room = clean(out.room, ROOM_MAX);
      } else if (out.place === 'CLIENT_SITE') {
        if (!customerId)
          throw new BadRequestException({ code: 'EVENT_CLIENT_REQUIRED', message: 'Choose the client.' });
        if (!out.location)
          throw new BadRequestException({ code: 'EVENT_ADDRESS_REQUIRED', message: 'Choose or type the address.' });
      }
    }
    return out;
  }

  async assertRefs(caller: Caller, spaceId: string | null, customerId: string | null) {
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
      const c = await clientInOrg(this.prisma, customerId, caller.organizationId);
      if (!c) throw new BadRequestException('Client not found');
    }
  }

  async loadForOrganizer(caller: Caller, eventId: string) {
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
}
