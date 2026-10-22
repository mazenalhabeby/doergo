/**
 * The four reads behind the phone's Crew card, pinned at the query.
 *
 *   all-entries?status=CLOCKED_IN   who is on
 *   breaks/active                   who is on a rest
 *   no-shows?days=1                 who has not come
 *   approvals/pending?summary=true  how many shifts wait, per workspace
 *
 * Every one is `canViewSpaceAttendance`, and the gateway guard only WIDENS (a
 * grant in one space lets the request through). What narrows it again is the
 * `where` each of these builds — so that is what is asserted, in all three
 * scope states: org-wide (null), some spaces, and none ([] = nothing).
 */
import { AttendanceService } from '../attendance.service';
import { noShowRecordParts } from './no-show-record.service.fixture';
import { AttendanceReadService } from '../reads/attendance-read.service';
import { AttendanceEntriesReadService } from '../reads/attendance-entries-read.service';
import { ApprovalService } from '../entries/approval.service';
import { breakServices } from './break.service.fixture';

const ORG = 'org-1';

/** The facade over the two collaborators these reads live in, each given only the database. */
function attendance(prisma: any) {
  const svc = Object.create(AttendanceService.prototype) as any;
  svc.noShows = Object.assign(noShowRecordParts(), { prisma });
  svc.reads = Object.assign(Object.create(AttendanceReadService.prototype), { prisma });
  svc.entryReads = Object.assign(Object.create(AttendanceEntriesReadService.prototype), { prisma });
  return svc as AttendanceService;
}
function approvals(prisma: any) {
  const svc = Object.create(ApprovalService.prototype) as any;
  svc.prisma = prisma;
  return svc as ApprovalService;
}
function breaks(prisma: any) {
  return breakServices(prisma);
}

describe('approvals/pending?summary=true — the count the card shows', () => {
  const groups = [
    { locationId: 'a', _count: { _all: 30 } },
    { locationId: 'b', _count: { _all: 19 } },
    { locationId: 'c', _count: { _all: 1 } },
  ];

  it('the total is exactly the sum of bySpace — the rings and the row can never disagree', async () => {
    const prisma = { timeEntry: { groupBy: jest.fn().mockResolvedValue(groups) } };
    const r: any = await approvals(prisma).getPendingApprovals({ organizationId: ORG, scopeSpaceIds: null, summary: true });
    expect(r.total).toBe(50);
    expect(Object.values(r.bySpace as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(r.total);
    expect(r.bySpace).toEqual({ a: 30, b: 19, c: 1 });
  });

  it('returns counts only — no rows, no findMany', async () => {
    const prisma = { timeEntry: { groupBy: jest.fn().mockResolvedValue(groups), findMany: jest.fn(), count: jest.fn() } };
    const r: any = await approvals(prisma).getPendingApprovals({ organizationId: ORG, scopeSpaceIds: null, summary: true });
    expect(Object.keys(r).sort()).toEqual(['bySpace', 'total']);
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.timeEntry.count).not.toHaveBeenCalled();
    expect(prisma.timeEntry.groupBy).toHaveBeenCalledTimes(1);
  });

  it('asks the same WHERE as the list, so the count and the list behind it agree', async () => {
    const prisma = {
      timeEntry: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = approvals(prisma);
    await svc.getPendingApprovals({ organizationId: ORG, scopeSpaceIds: ['a'], summary: true });
    await svc.getPendingApprovals({ organizationId: ORG, scopeSpaceIds: ['a'] });
    expect(prisma.timeEntry.groupBy.mock.calls[0][0].where).toEqual(prisma.timeEntry.count.mock.calls[0][0].where);
  });

  it.each([
    ['org-wide', null, undefined],
    ['one site', ['a'], { in: ['a'] }],
    ['granted nowhere — matches NOTHING, never everything', [], { in: [] }],
  ])('narrows by the caller\'s spaces: %s', async (_label, scope, expected) => {
    const prisma = { timeEntry: { groupBy: jest.fn().mockResolvedValue([]) } };
    await approvals(prisma).getPendingApprovals({ organizationId: ORG, scopeSpaceIds: scope as any, summary: true });
    const where = prisma.timeEntry.groupBy.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.approvalStatus).toBe('PENDING');
    // A shift still running is not waiting for a decision.
    expect(where.status).toEqual({ not: 'CLOCKED_IN' });
    expect(where.locationId).toEqual(expected);
  });
});

describe('breaks/active — who is on a rest', () => {
  const row = {
    id: 'b1', timeEntryId: 'e1', startedAt: new Date(), endedAt: null, ruleId: null,
    timeEntry: { id: 'e1', user: { id: 'u1', firstName: 'A', lastName: 'B' }, location: { id: 'a', name: 'Main', timezone: 'Europe/Vienna' } },
  };

  it.each([
    ['org-wide', null, undefined],
    ['one site', ['a'], { in: ['a'] }],
    ['granted nowhere', [], { in: [] }],
  ])('narrows through the entry\'s space: %s', async (_l, scope, expected) => {
    const prisma = { break: { findMany: jest.fn().mockResolvedValue([row]) } };
    await breaks(prisma).getActiveBreaks({ organizationId: ORG, scopeSpaceIds: scope as any });
    const where = prisma.break.findMany.mock.calls[0][0].where;
    expect(where.endedAt).toBeNull();
    expect(where.timeEntry.organizationId).toBe(ORG);
    expect(where.timeEntry.locationId).toEqual(expected);
  });

  /*
    It shipped the whole workspace row, twice per break, every minute — cost
    and bill rates and contact details included, to anybody who can see one
    site's attendance (an external supervisor among them).
  */
  it('never ships the whole workspace row — only what a reader draws', async () => {
    const prisma = { break: { findMany: jest.fn().mockResolvedValue([row]) } };
    await breaks(prisma).getActiveBreaks({ organizationId: ORG, scopeSpaceIds: null });
    const include = prisma.break.findMany.mock.calls[0][0].include;
    const loc = include.timeEntry.include.location;
    expect(loc).not.toBe(true);
    expect(Object.keys(loc.select).sort()).toEqual(['address', 'id', 'name', 'timezone']);
    for (const secret of ['costRateCents', 'billableRateCents', 'contactPhone', 'contactEmail', 'geofencePolygon']) {
      expect(loc.select[secret]).toBeUndefined();
    }
  });

  it('still flattens the owner onto `user` — the web and the phone key on it', async () => {
    const prisma = { break: { findMany: jest.fn().mockResolvedValue([row]) } };
    const r: any = await breaks(prisma).getActiveBreaks({ organizationId: ORG, scopeSpaceIds: null });
    expect(r.data[0].user.id).toBe('u1');
    expect(r.data[0].timeEntryId).toBe('e1');
    expect(r.data[0].location.timezone).toBe('Europe/Vienna');
  });
});

describe('no-shows — who has not come', () => {
  function prismaWith(rows: any[] = []) {
    return {
      shiftInstance: { findMany: jest.fn().mockResolvedValue(rows) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    };
  }

  /*
    The scope used to be SPREAD after `{ spaceId }`, which replaced the key: a
    site lead with two sites asking for one got both. Both must hold.
  */
  it('keeps the asked-for site AND the scope — neither replaces the other', async () => {
    const prisma = prismaWith();
    await attendance(prisma).listNoShows({ organizationId: ORG, days: 1, spaceId: 'a', scopeSpaceIds: ['a', 'b'] });
    const where = prisma.shiftInstance.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ spaceId: 'a' }, { spaceId: { in: ['a', 'b'] } }]);
  });

  it('a site outside the scope still reads nothing — the scope is never dropped', async () => {
    const prisma = prismaWith();
    await attendance(prisma).listNoShows({ organizationId: ORG, days: 1, spaceId: 'x', scopeSpaceIds: ['a'] });
    const where = prisma.shiftInstance.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ spaceId: { in: ['a'] } });
    expect(where.AND).toContainEqual({ spaceId: 'x' });
  });

  it('granted nowhere matches nothing', async () => {
    const prisma = prismaWith();
    await attendance(prisma).listNoShows({ organizationId: ORG, days: 1, scopeSpaceIds: [] });
    const where = prisma.shiftInstance.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ spaceId: { in: [] } });
  });

  it('org-wide adds no narrowing', async () => {
    const prisma = prismaWith();
    await attendance(prisma).listNoShows({ organizationId: ORG, days: 1, scopeSpaceIds: null });
    const where = prisma.shiftInstance.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{}, {}]);
    expect(where.organizationId).toBe(ORG);
  });

  it('days=1 is a window up to NOW, bounded, and never asks for a future shift', async () => {
    const prisma = prismaWith();
    const before = Date.now();
    await attendance(prisma).listNoShows({ organizationId: ORG, days: 1, scopeSpaceIds: null });
    const q = prisma.shiftInstance.findMany.mock.calls[0][0];
    const { gte, lte } = q.where.expectedClockInAt;
    expect(lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(lte.getTime() - gte.getTime()).toBe(86_400_000);
    expect(q.take).toBe(300);
    expect(q.where.state).toEqual({ in: ['REMINDED', 'ESCALATED', 'EXCUSED', 'ABSENT'] });
  });

  it('names people and places in two batched reads, not one per row (no N+1)', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      id: `i${i}`, userId: `u${i % 40}`, spaceId: `s${i % 7}`, state: 'ESCALATED',
      expectedClockInAt: new Date(), expectedClockOutAt: new Date(), reminderCount: 1, localDate: '2026-09-26',
    }));
    const prisma = prismaWith(rows);
    const r: any = await attendance(prisma).listNoShows({ organizationId: ORG, days: 1, scopeSpaceIds: null });
    expect(r.data).toHaveLength(150);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toHaveLength(40);
    // The rows' places once; the run hints name where else they clocked in, once more — never per row.
    expect(prisma.companyLocation.findMany.mock.calls.length).toBeLessThanOrEqual(2);
    expect(prisma.companyLocation.findMany.mock.calls[0][0].where.id.in).toHaveLength(7);
    expect(prisma.shiftInstance.findMany.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe('all-entries?status=CLOCKED_IN — who is on', () => {
  function prismaWith() {
    return { timeEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
  }

  it.each([
    ['org-wide', null, undefined],
    ['one site', ['a'], { in: ['a'] }],
    ['granted nowhere', [], { in: [] }],
  ])('narrows by the caller\'s spaces: %s', async (_l, scope, expected) => {
    const prisma = prismaWith();
    await attendance(prisma).getAllEntries({ organizationId: ORG, scopeSpaceIds: scope as any, status: 'CLOCKED_IN', limit: 300 });
    const q = prisma.timeEntry.findMany.mock.calls[0][0];
    expect(q.where.locationId).toEqual(expected);
    expect(q.where.status).toBe('CLOCKED_IN');
    expect(q.take).toBe(300);
  });

  /*
    ⚠️ NO DATE WITHOUT ONE ASKED. A night shift that clocked in yesterday is on
    the clock NOW; a default "today" would drop it from the card at midnight.
  */
  it('asks no date when none is given — an overnight shift is still on', async () => {
    const prisma = prismaWith();
    await attendance(prisma).getAllEntries({ organizationId: ORG, scopeSpaceIds: null, status: 'CLOCKED_IN', limit: 300 });
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where.clockInAt).toBeUndefined();
  });

  it('one page, its relations joined by the query — not a read per person', async () => {
    const prisma = prismaWith();
    await attendance(prisma).getAllEntries({ organizationId: ORG, scopeSpaceIds: null, status: 'CLOCKED_IN', limit: 300 });
    expect(prisma.timeEntry.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.timeEntry.count).toHaveBeenCalledTimes(1);
    const inc = prisma.timeEntry.findMany.mock.calls[0][0].include;
    expect(inc.user.select).toBeDefined();
    expect(inc.location.select).toBeDefined();
  });
});
