import { buildIcs, occurrences, repeatToRrule } from '@hbcfield/shared';
import { eventServices } from './events.service.fixture';

/* Regressions found by the calendar audit (2026-10-06) — each one pinned. */

describe('repeating events far from their start', () => {
  it('a daily series from 2026 still exists in 2031, and only the window is converted', () => {
    const start = new Date('2026-01-05T08:00:00Z');
    const list = occurrences(start, 1800000, { freq: 'DAILY', interval: 1 }, 'Europe/Vienna', new Date('2031-06-02T00:00:00Z'), new Date('2031-06-05T00:00:00Z'));
    expect(list.length).toBe(3);
  });

  it('a counted series still stops at its count when the window is far ahead', () => {
    const start = new Date('2026-01-05T08:00:00Z');
    expect(occurrences(start, 1, { freq: 'DAILY', interval: 1, count: 10 }, 'UTC', new Date('2026-01-14T00:00:00Z'), new Date('2026-02-01T00:00:00Z')).length).toBe(1);
  });
});

describe('the feed repeats at wall time', () => {
  it('a repeating timed event is written in its zone; an all-day series ends on a DATE', () => {
    const ics = buildIcs('O', [{ uid: 'u', title: 'Stand-up', start: new Date('2026-10-26T08:00:00Z'), end: new Date('2026-10-26T08:30:00Z'), allDay: false, tzid: 'Europe/Vienna', rrule: 'FREQ=WEEKLY' }]);
    expect(ics).toContain('DTSTART;TZID=Europe/Vienna:20261026T090000');
    expect(repeatToRrule({ freq: 'YEARLY', interval: 1, until: '2030-01-01' }, true)).toBe('FREQ=YEARLY;UNTIL=20300101');
  });
});

function svcWith(ev: any) {
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    calendarEvent: { findFirst: jest.fn().mockResolvedValue(ev), update: jest.fn() },
    calendarAttendee: { updateMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }), findMany: jest.fn().mockResolvedValue([]) },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const notifications = { emit: jest.fn() };
  const svc = eventServices(prisma, { workspacesOf: jest.fn().mockResolvedValue([]) } as any, notifications as any);
  // The read-back after a save is not under test.
  (svc as any).get = jest.fn().mockResolvedValue({});
  return { svc, prisma, notifications };
}

const base = {
  id: 'e1', organizationId: 'org', createdById: 'me', kind: 'APPOINTMENT', title: 'Review', description: null, location: null,
  meetingUrl: null, customerId: null, spaceId: null, startAt: new Date('2027-03-01T10:00:00Z'), endAt: new Date('2027-03-01T10:30:00Z'),
  allDay: false, timezone: 'UTC', repeat: null, reminderOffsets: [10], visibility: 'BUSY', canceledAt: null,
  attendees: [{ id: 'a0', userId: 'me', isOrganizer: true, response: 'ACCEPTED' }, { id: 'a1', userId: 'k', isOrganizer: false, response: 'ACCEPTED' }],
};
const me = { userId: 'me', organizationId: 'org', role: 'ADMIN' };

describe('editing an event', () => {
  it('a title-only save sends the same times back — nobody is asked again, nobody is told it moved', async () => {
    const { svc, prisma, notifications } = svcWith(base);
    await svc.update({ ...me, eventId: 'e1', input: { title: 'Review v2', startAt: base.startAt.toISOString(), endAt: base.endAt.toISOString(), timezone: 'UTC', reminders: [10] } });
    const resets = prisma.calendarAttendee.updateMany.mock.calls.filter((c: any[]) => c[0].data?.response === 'PENDING');
    expect(resets).toHaveLength(0);
    expect(notifications.emit).not.toHaveBeenCalledWith('calendar_updated', expect.anything());
  });

  it('a PATCH without an end keeps a multi-day all-day event its length', async () => {
    const allDay = { ...base, allDay: true, startAt: new Date('2027-03-01T00:00:00Z'), endAt: new Date('2027-03-06T00:00:00Z') };
    const { svc, prisma } = svcWith(allDay);
    await svc.update({ ...me, eventId: 'e1', input: { title: 'x' } });
    const data = prisma.calendarEvent.update.mock.calls[0][0].data;
    expect(data.endAt.toISOString()).toBe('2027-03-06T00:00:00.000Z');
  });
});

describe('a reminder button acts on the occurrence the push named', () => {
  it('+10 min on this week’s stand-up stays about this week', async () => {
    const weekly = { ...base, repeat: { freq: 'WEEKLY', interval: 1 }, startAt: new Date('2026-10-05T08:00:00Z'), endAt: new Date('2026-10-05T08:15:00Z') };
    const { svc, prisma } = svcWith(weekly);
    // The sweep already moved the row to NEXT week's occurrence.
    prisma.calendarAttendee.findFirst.mockResolvedValue({ id: 'a0', remindOccurrence: new Date('2026-10-19T08:00:00Z'), event: weekly });
    await svc.snooze({ ...me, eventId: 'e1', occurrence: '2026-10-12T08:00:00.000Z' });
    expect(prisma.calendarAttendee.update.mock.calls[0][0].data.remindOccurrence.toISOString()).toBe('2026-10-12T08:00:00.000Z');
  });

  it('an occurrence that is not part of the series is ignored', async () => {
    const weekly = { ...base, repeat: { freq: 'WEEKLY', interval: 1 }, startAt: new Date('2026-10-05T08:00:00Z'), endAt: new Date('2026-10-05T08:15:00Z') };
    const { svc, prisma } = svcWith(weekly);
    prisma.calendarAttendee.findFirst.mockResolvedValue({ id: 'a0', remindOccurrence: new Date('2026-10-19T08:00:00Z'), event: weekly });
    await svc.snooze({ ...me, eventId: 'e1', occurrence: '2026-10-13T09:17:00.000Z' });
    expect(prisma.calendarAttendee.update.mock.calls[0][0].data.remindOccurrence.toISOString()).toBe('2026-10-19T08:00:00.000Z');
  });
});

describe('availability tells a colleague "not working", never why', () => {
  it('outside the caller\'s team: no leave status, the day reads as off', async () => {
    const prisma: any = {
      organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
      user: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.isActive ? [{ id: 'k', firstName: 'K', lastName: 'A' }] : [{ id: 'me', firstName: 'M', lastName: 'E' }, { id: 'k', firstName: 'K', lastName: 'A' }])) },
      calendarAttendee: { findMany: jest.fn().mockResolvedValue([]) },
      timeOff: { findMany: jest.fn().mockResolvedValue([{ technicianId: 'k', startDate: new Date('2027-03-01T00:00:00Z'), endDate: new Date('2027-03-01T00:00:00Z'), status: 'APPROVED' }]) },
      spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const rules: any = { personRulesMany: jest.fn().mockResolvedValue(new Map()), workspacesOf: jest.fn() };
    const svc = eventServices(prisma, rules, { emit: jest.fn() } as any);
    const r: any = await svc.availability({ userId: 'me', organizationId: 'org', role: 'ADMIN', teamSpaces: [], userIds: ['k'], from: '2027-03-01T07:00:00Z', to: '2027-03-01T19:00:00Z' } as any);
    const k = r.data.find((x: any) => x.userId === 'k');
    expect(k.days[0]).toEqual({ day: '2027-03-01', kind: 'off', leave: null });
  });
});

describe('a rota that does not reach a day leaves the weekend a weekend', () => {
  it('a rota starting next month does not make this Saturday a working day', () => {
    const { isRosteredOn } = require('@hbcfield/shared');
    const p = {
      id: 'p', firstName: 'A', lastName: 'B', spaceId: '', specialty: null, position: null, scheduleDows: [], restDows: [0, 6],
      shiftRules: [{ recurrence: 'DAILY', daysOfWeek: [], daysOfMonth: [], dates: [], effectiveFrom: '2026-12-01', effectiveTo: null }],
    };
    expect(isRosteredOn(p, '2026-10-31')).toBe(false);
    expect(isRosteredOn(p, '2026-10-30')).toBe(true);
  });
});
