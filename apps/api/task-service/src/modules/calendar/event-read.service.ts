import { Injectable } from '@nestjs/common';
import {
  addDaysStr,
  isAdmin,
  localPartsIn,
  occurrences,
  success,
  type CalendarItem,
  type Repeat,
  personName,
  personSearchOr,
} from '@hbcfield/shared';
import { Caller, clean } from './events-helpers';
import { EventsBase } from './events.base';

/** Reading the calendar's events: the items in a window, and the people one may invite. */
@Injectable()
export class EventReadService extends EventsBase {
  /** Colleagues for the invite picker — the same circle `inviteable` accepts. */
  async people(dto: Caller & { q?: string }) {
    const q = clean(dto.q, 60);
    const wide = isAdmin({ role: dto.role as string }) || dto.canManageUsers || dto.orgWideView;
    const circle = wide ? null : await this.circleOf(dto);
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: dto.organizationId, isActive: true, isExternal: false, role: { not: 'CUSTOMER' }, id: { not: dto.userId },
        ...(circle ? { id: { in: [...circle].filter((id) => id !== dto.userId) } } : {}),
        ...(q ? { OR: personSearchOr(q, ['firstName', 'lastName', 'position']) } : {}),
      },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 30,
    });
    return success(rows);
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
          meetingMode: ev.meetingMode,
          phone: ev.phone,
          room: ev.room,
          note: mine?.isOrganizer ? null : personName(ev.createdBy),
        });
        if (out.length >= 2000) return out;
      }
    }
    return out;
  }
}
