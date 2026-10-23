import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, success, crmReachOfRow, crmReachesClientIn, personCrmReach } from '@hbcfield/shared';
import { Caller } from './events-helpers';

/**
 * Reading events: one event as THIS reader may see it (404 when they are not on it), and the
 * events overlapping a window for some people.
 */
@Injectable()
export class EventViewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The event's client, as THIS viewer may see it — or null.
   *
   * "Reads the client book" (`crm`) was the whole test, so a rep with
   * own-scope CRM invited by another rep read the name of a client that is not
   * theirs. Now the CRM's own reach rule (crm/client-reach.ts): all-scope sees
   * it, own-scope only a client they own or co-manage. The organizer is asked
   * the same — handing a meeting over does not hand over the client.
   */
  private async clientShownTo(
    caller: Caller,
    client: { id: string; name: string; spaceId?: string | null; ownerId: string | null; managerIds: string[] } | null,
  ): Promise<{ id: string; name: string } | null> {
    if (!client || !caller.crm) return null;
    if (caller.role === 'ADMIN') return { id: client.id, name: client.name };
    // Org-wide CRM, or a CRM grant in the workspace the client is filed in (crm/crm-reach.ts).
    const row = await personCrmReach(this.prisma, caller.userId, caller.organizationId);
    return crmReachesClientIn(crmReachOfRow(row as never), client, caller.userId)
      ? { id: client.id, name: client.name }
      : null;
  }

  async get(dto: Caller & { eventId: string }) {
    const ev = await this.prisma.calendarEvent.findFirst({
      where: { id: dto.eventId, organizationId: dto.organizationId, attendees: { some: { userId: dto.userId } } },
      include: {
        attendees: {
          select: {
            userId: true,
            response: true,
            isOrganizer: true,
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        customer: { select: { id: true, name: true, spaceId: true, ownerId: true, managerIds: true } },
        space: { select: { id: true, name: true } },
        placeSpace: { select: { id: true, name: true, address: true, lat: true, lng: true } },
      },
    });
    if (!ev) throw new NotFoundException('Not found');
    const me = ev.attendees.find((a) => a.userId === dto.userId)!;
    const customer = await this.clientShownTo(dto, ev.customer);
    return success({
      id: ev.id,
      kind: ev.kind,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      meetingUrl: ev.meetingUrl,
      startAt: ev.startAt.toISOString(),
      endAt: ev.endAt.toISOString(),
      allDay: ev.allDay,
      timezone: ev.timezone,
      repeat: ev.repeat ?? null,
      reminders: ev.reminderOffsets,
      visibility: ev.visibility,
      canceled: !!ev.canceledAt,
      space: ev.space,
      customer,
      meetingMode: ev.meetingMode,
      placeKind: ev.placeKind,
      placeSpace: ev.placeSpace,
      room: ev.room,
      phone: ev.phone,
      callDirection: ev.callDirection,
      organizerId: ev.createdById,
      canEdit: ev.createdById === dto.userId,
      myResponse: me.response,
      attendees: ev.attendees.map((a) => ({
        userId: a.userId,
        response: a.response,
        isOrganizer: a.isOrganizer,
        firstName: a.user.firstName,
        lastName: a.user.lastName,
        avatarUrl: a.user.avatarUrl,
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
  async eventsFor(organizationId: string, userIds: string[], from: Date, to: Date, includeDeclined = false) {
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
