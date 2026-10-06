import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from '../events.service';
import { FeedService } from '../feed.service';

/*
  The calendar's security boundary, at the service: who reads an event, who changes it, who may
  be invited, what the minute sweep sends, and what a feed link opens. The gateway narrows first;
  these are the checks that hold even when a route is called directly.
*/

const caller = { userId: 'me', organizationId: 'org', role: 'EMPLOYEE' };
const soon = () => new Date(Date.now() + 3 * 86400000);

function make(over: Record<string, any> = {}) {
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Vienna' }) },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }),
    },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    customer: { findFirst: jest.fn().mockResolvedValue(null) },
    calendarEvent: {
      create: jest.fn().mockResolvedValue({ id: 'e1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    calendarAttendee: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...over,
  };
  const rules: any = { workspacesOf: jest.fn().mockResolvedValue(['s1']), personRules: jest.fn() };
  const notifications: any = { emit: jest.fn() };
  return { svc: new EventsService(prisma, rules, notifications), prisma, rules, notifications };
}

const input = (extra: Record<string, unknown> = {}) => {
  const s = soon();
  return { title: 'Review', startAt: s.toISOString(), endAt: new Date(s.getTime() + 1800000).toISOString(), ...extra };
};

describe('calendar events — who may do what', () => {
  it('somebody not on an event cannot read it: 404, never 403', async () => {
    const { svc } = make();
    await expect(svc.get({ ...caller, eventId: 'e1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('an invitee cannot change it (only the organizer)', async () => {
    const { svc, prisma } = make();
    prisma.calendarEvent.findFirst.mockResolvedValue({ id: 'e1', createdById: 'boss', attendees: [{ userId: 'me', isOrganizer: false, response: 'ACCEPTED' }] });
    const err = await svc.update({ ...caller, eventId: 'e1', input: { title: 'x' } }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'EVENT_NOT_ORGANIZER' });
  });

  it('a member invites only people they share a workspace with', async () => {
    const { svc, prisma } = make();
    prisma.user.findMany.mockResolvedValue([{ id: 'stranger', firstName: 'S', lastName: 'T' }]);
    prisma.spaceAssignment.findMany.mockResolvedValue([{ userId: 'me' }, { userId: 'colleague' }]);
    const err = await svc.create({ ...caller, input: input({ attendeeIds: ['stranger'] }) }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'EVENT_PERSON_NOT_REACHABLE' });
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('…while somebody who sees all the work may invite anybody in the organization', async () => {
    const { svc, prisma } = make();
    prisma.user.findMany.mockResolvedValue([{ id: 'stranger', firstName: 'S', lastName: 'T' }]);
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 'e1', kind: 'APPOINTMENT', title: 'Review', startAt: soon(), endAt: soon(), allDay: false, timezone: 'UTC', reminderOffsets: [10],
      visibility: 'BUSY', canceledAt: null, createdById: 'me', attendees: [{ userId: 'me', response: 'ACCEPTED', isOrganizer: true, user: { firstName: 'M', lastName: 'E' } }],
      customer: null, space: null, repeat: null, description: null, location: null, meetingUrl: null,
    });
    await svc.create({ ...caller, orgWideView: true, input: input({ attendeeIds: ['stranger'] }) });
    expect(prisma.calendarEvent.create).toHaveBeenCalled();
  });

  it('an external member, a client account or somebody from another org is not a colleague', async () => {
    const { svc, prisma } = make();
    prisma.user.findMany.mockResolvedValue([]); // the query filters isExternal / CUSTOMER / organizationId
    const err = await svc.create({ ...caller, input: input({ attendeeIds: ['outsider'] }) }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'EVENT_PERSON_UNKNOWN' });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: 'org', isActive: true, isExternal: false, role: { not: 'CUSTOMER' } });
  });

  it('a meeting link is a web address, never javascript:', async () => {
    const { svc } = make();
    const err = await svc.create({ ...caller, input: input({ meetingUrl: 'javascript:alert(1)' }) }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'MEETING_URL_INVALID' });
  });

  it('an event longer than two weeks, or ending before it starts, is refused', async () => {
    const { svc } = make();
    const s = soon();
    await expect(svc.create({ ...caller, input: { title: 'x', startAt: s.toISOString(), endAt: new Date(s.getTime() + 20 * 86400000).toISOString() } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create({ ...caller, input: { title: 'x', startAt: s.toISOString(), endAt: s.toISOString() } })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('the reminder sweep', () => {
  const row = (over: Record<string, any> = {}) => ({
    id: 'a1', userId: 'me', response: 'ACCEPTED', nextRemindAt: new Date(Date.now() - 1000), remindOccurrence: soon(),
    event: { id: 'e1', organizationId: 'org', kind: 'REMINDER', title: 'Call', startAt: soon(), endAt: new Date(soon().getTime() + 1800000), allDay: false, timezone: 'UTC', repeat: null, reminderOffsets: [10], canceledAt: null, meetingUrl: null },
    ...over,
  });

  it('sends once: a row another replica claimed first is skipped', async () => {
    const { svc, prisma, notifications } = make();
    prisma.calendarAttendee.findMany.mockResolvedValue([row()]);
    prisma.calendarAttendee.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.sweepDue()).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('claims with the instant it read, then sends', async () => {
    const { svc, prisma, notifications } = make();
    const r = row();
    prisma.calendarAttendee.findMany.mockResolvedValue([r]);
    expect(await svc.sweepDue()).toBe(1);
    expect(prisma.calendarAttendee.updateMany.mock.calls[0][0].where).toEqual({ id: 'a1', nextRemindAt: r.nextRemindAt });
    expect(notifications.emit).toHaveBeenCalledWith('calendar_reminder', expect.objectContaining({ userId: 'me', eventId: 'e1' }));
  });

  it('a canceled event or a declined invitation goes quiet for good', async () => {
    const { svc, prisma, notifications } = make();
    prisma.calendarAttendee.findMany.mockResolvedValue([row({ response: 'DECLINED' }), row({ id: 'a2', event: { ...row().event, canceledAt: new Date() } })]);
    expect(await svc.sweepDue()).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
    for (const call of prisma.calendarAttendee.updateMany.mock.calls) expect(call[0].data.nextRemindAt).toBeNull();
  });
});

describe('the feed link', () => {
  const feed = (row: any) => new FeedService({
    calendarFeedToken: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn().mockResolvedValue({}) },
  } as any, {} as any);

  it('a malformed or unknown token is the same plain 404', async () => {
    await expect(feed(null).render({ token: 'short' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(feed(null).render({ token: 'A'.repeat(43) })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dies with a suspended organization, a switched-off feed, or a deactivated member', async () => {
    const base = (org: Record<string, unknown>, user: Record<string, unknown> = {}) => ({
      id: 'f', organizationId: 'org', lastUsedAt: new Date(),
      user: { id: 'u', isActive: true, firstName: 'A', organizationId: 'org', ...user, organization: { id: 'org', name: 'O', timezone: 'UTC', calendarFeedsEnabled: true, suspendedAt: null, isActive: true, ...org } },
    });
    const t = 'A'.repeat(43);
    await expect(feed(base({ suspendedAt: new Date() })).render({ token: t })).rejects.toBeInstanceOf(NotFoundException);
    await expect(feed(base({ calendarFeedsEnabled: false })).render({ token: t })).rejects.toBeInstanceOf(NotFoundException);
    await expect(feed(base({}, { isActive: false })).render({ token: t })).rejects.toBeInstanceOf(NotFoundException);
    await expect(feed(base({}, { organizationId: 'other' })).render({ token: t })).rejects.toBeInstanceOf(NotFoundException);
  });
});
