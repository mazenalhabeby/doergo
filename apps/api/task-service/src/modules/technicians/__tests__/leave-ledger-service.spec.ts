import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { makeDayRules } from '@hbcfield/shared';
import { leaveLedgerServices } from './leave-ledger.service.fixture';
import { LeaveCarryOverService } from '../leave-carry-over.service';

/**
 * The leave ledger through the SERVICE — the balance every screen reads, the ledger lines, the
 * starting balances and the carry-over rule — against a small in-memory database, so what is
 * tested is the queries' meaning, not their spelling.
 *
 * Mark: 25 days a year, the organization started HBCField in August, he had already used 10 in
 * the old system. Before the ledger he read 25 remaining.
 */

type Row = Record<string, any>;
const D = (day: string) => new Date(`${day}T00:00:00Z`);
const ORG = 'org-1';

function fakeDb(seed: { orgs: Row[]; users: Row[]; timeOffs?: Row[]; assignments?: Row[] }) {
  const db = {
    orgs: seed.orgs,
    users: seed.users,
    timeOffs: seed.timeOffs ?? [],
    assignments: seed.assignments ?? [],
    adjustments: [] as Row[],
  };
  let n = 0;
  const inList = (cond: any, v: any) => {
    if (cond === undefined) return true;
    if (cond === null) return v === null || v === undefined;
    if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
    if (typeof cond === 'object') {
      if ('in' in cond) return cond.in.some((c: any) => (c instanceof Date ? v?.getTime?.() === c.getTime() : c === v));
      if ('not' in cond) return v !== cond.not;
      if ('lte' in cond) return v <= cond.lte;
      if ('gte' in cond) return v >= cond.gte;
    }
    return cond === v;
  };
  const brief = (id: string | null) => {
    const u = id ? db.users.find((x) => x.id === id) : null;
    return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName } : null;
  };
  const shapeAdj = (a: Row) => ({ ...a, createdBy: brief(a.createdById), voidedBy: brief(a.voidedById) });
  const userMatches = (u: Row, where: any) => {
    for (const [k, c] of Object.entries(where ?? {})) {
      if (k === 'spaceAssignments') {
        const spaces = (c as any).some.spaceId.in as string[];
        if (!db.assignments.some((a) => a.userId === u.id && spaces.includes(a.spaceId))) return false;
        continue;
      }
      if (!inList(c, u[k])) return false;
    }
    return true;
  };
  const orgOf = (id: string) => db.orgs.find((o) => o.id === id);

  const prisma: any = {
    user: {
      findFirst: jest.fn(async ({ where, select }: any) => {
        const u = db.users.find((x) => userMatches(x, where));
        if (!u) return null;
        return select?.organization ? { ...u, organization: orgOf(u.organizationId) } : u;
      }),
      findMany: jest.fn(async ({ where }: any) => db.users.filter((u) => userMatches(u, where))),
    },
    organization: {
      findUnique: jest.fn(async ({ where }: any) => orgOf(where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) => db.orgs.filter((o) => o.carryOverMode !== where.carryOverMode.not)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const o = orgOf(where.id);
        if (o && (where.leaveTrackingStartedOn !== null || o.leaveTrackingStartedOn == null)) Object.assign(o, data);
        return { count: o ? 1 : 0 };
      }),
    },
    timeOff: {
      findMany: jest.fn(async ({ where }: any) =>
        db.timeOffs.filter((t) => inList(where.technicianId, t.technicianId) && inList(where.kind, t.kind ?? 'LEAVE') && inList(where.type, t.type ?? 'VACATION')
          && inList(where.status, t.status) && t.startDate <= where.startDate.lte && t.endDate >= where.endDate.gte)),
    },
    spaceAssignment: {
      findFirst: jest.fn(async ({ where }: any) => db.assignments.find((a) => a.userId === where.userId && where.spaceId.in.includes(a.spaceId)) ?? null),
    },
    leaveAdjustment: {
      findMany: jest.fn(async ({ where }: any) =>
        db.adjustments.filter((a) => Object.entries(where).every(([k, c]) => (k === 'sourceKey' ? (c as any).in.includes(a.sourceKey) : inList(c, a[k])))).map(shapeAdj)),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `adj-${++n}`, createdAt: new Date(), voidedAt: null, voidedById: null, sourceKey: null, ...data };
        db.adjustments.push(row);
        return shapeAdj(row);
      }),
      createMany: jest.fn(async ({ data, skipDuplicates }: any) => {
        let count = 0;
        for (const d of data) {
          if (d.sourceKey && db.adjustments.some((a) => a.sourceKey === d.sourceKey)) {
            if (skipDuplicates) continue;
            throw new Error('unique sourceKey');
          }
          db.adjustments.push({ id: `adj-${++n}`, createdAt: new Date(), voidedAt: null, voidedById: null, createdById: null, ...d });
          count++;
        }
        return { count };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = db.adjustments.filter((a) =>
          Object.entries(where).every(([k, c]) => (k === 'voidedAt' ? c !== null || a.voidedAt === null : inList(c, a[k]))));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
      findUnique: jest.fn(async ({ where }: any) => db.adjustments.find((a) => a.id === where.id) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => shapeAdj(db.adjustments.find((a) => a.id === where.id)!)),
    },
    // The one raw statement: release keys and void (values: callerId, ids).
    $executeRaw: jest.fn(async (_s: TemplateStringsArray, callerId: string, ids: string[]) => {
      for (const a of db.adjustments.filter((x) => ids.includes(x.id))) {
        a.sourceKey = `${a.sourceKey}#void:${a.id}`;
        a.voidedAt = a.voidedAt ?? new Date();
        a.voidedById = a.voidedById ?? callerId;
      }
      return ids.length;
    }),
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, db };
}

/* Weekends off, no holidays — every weekday costs one day. */
const calendarRules: any = {
  personRulesMany: jest.fn(async (_org: string, ids: string[]) => new Map(ids.map((id) => [id, { rules: makeDayRules([0, 6], []), spaceIds: [] }]))),
  personRules: jest.fn(async () => ({ rules: makeDayRules([0, 6], []), spaceIds: [] })),
};

const org = (over: Row = {}): Row => ({
  id: ORG, createdAt: D('2025-01-01'), timezone: 'UTC', defaultLeaveAllowance: 25, leaveYearMode: 'CALENDAR',
  carryOverMode: 'NONE', carryOverMaxDays: null, carryExpiresAfterMonths: null, leaveTrackingStartedOn: null, ...over,
});
const person = (id: string, over: Row = {}): Row => ({
  id, organizationId: ORG, firstName: id[0]!.toUpperCase() + id.slice(1), lastName: 'Doe', email: `${id}@example.com`, avatarUrl: null,
  leaveAllowance: null, employmentStartDate: null, createdAt: D('2025-01-01'), isActive: true, isExternal: false, role: 'EMPLOYEE', ...over,
});
const ADMIN = person('owner', { role: 'ADMIN', lastName: 'Owner' });
const MANAGER = person('anna', { lastName: 'Müller' });

describe('leave ledger — the service', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date('2026-08-14T09:00:00Z')));
  afterAll(() => jest.useRealTimers());

  describe("Mark's case end to end", () => {
    it('25 − 10 used before HBCField = 15; then a 3-day vacation → 12', async () => {
      const { prisma, db } = fakeDb({ orgs: [org()], users: [ADMIN, MANAGER, person('mark')] });
      const ledger = leaveLedgerServices(prisma, calendarRules);

      // Before: the bug — a full year left.
      expect((await ledger.getBalance({ technicianId: 'mark', organizationId: ORG })).remaining).toBe(25);

      const saved = await ledger.saveOpening({ organizationId: ORG, callerId: 'anna', on: '2026-08-01', rows: [{ userId: 'mark', used: 10, carried: 0 }] });
      expect(saved).toMatchObject({ written: 1, voided: 0, trackingStartedOn: '2026-08-01' });
      const b = await ledger.getBalance({ technicianId: 'mark', organizationId: ORG });
      expect(b).toMatchObject({ allowance: 25, adjusted: -10, taken: 0, remaining: 15, leaveYear: { start: '2026-01-01', end: '2026-12-31', mode: 'CALENDAR' } });
      expect(b.lines).toEqual([{ key: 'ALLOWANCE', days: 25 }, { key: 'OPENING_USED', days: -10 }]);

      // Mon 24 – Wed 26 August, approved: three working days.
      db.timeOffs.push({ technicianId: 'mark', kind: 'LEAVE', type: 'VACATION', status: 'APPROVED', startDate: D('2026-08-24'), endDate: D('2026-08-26') });
      const after = await ledger.getBalance({ technicianId: 'mark', organizationId: ORG });
      expect(after).toMatchObject({ taken: 3, remaining: 12 });
      // Old clients keep their fields.
      expect(after).toEqual(expect.objectContaining({ year: 2026, pending: 0, prorated: false, fullAllowance: 25, startedOn: null }));
    });

    it('saving the same table twice writes once; changing a number replaces the line (never edits it)', async () => {
      const { prisma, db } = fakeDb({ orgs: [org()], users: [ADMIN, MANAGER, person('mark')] });
      const ledger = leaveLedgerServices(prisma, calendarRules);
      await ledger.saveOpening({ organizationId: ORG, callerId: 'anna', on: '2026-08-01', rows: [{ userId: 'mark', used: 10, carried: 2 }] });
      const again = await ledger.saveOpening({ organizationId: ORG, callerId: 'anna', on: '2026-08-01', rows: [{ userId: 'mark', used: 10, carried: 2 }] });
      expect(again).toMatchObject({ written: 0, voided: 0, unchanged: 2 });
      expect(db.adjustments).toHaveLength(2);

      const changed = await ledger.saveOpening({ organizationId: ORG, callerId: 'anna', on: '2026-08-01', rows: [{ userId: 'mark', used: 8, carried: 0 }] });
      expect(changed).toMatchObject({ written: 1, voided: 2 });
      expect(db.adjustments).toHaveLength(3); // nothing deleted
      expect((await ledger.getBalance({ technicianId: 'mark', organizationId: ORG })).remaining).toBe(17);
      const opening = await ledger.getOpening({ organizationId: ORG, on: '2026-08-01' });
      expect(opening.rows.find((r) => r.userId === 'mark')).toMatchObject({ used: 8, carried: 0, remaining: 17 });
    });
  });

  it('a fixed number of queries: one balance = 3, a whole team = the same 3 + the member list', async () => {
    const team = Array.from({ length: 40 }, (_, i) => person(`p${i}`));
    const timeOffs = team.flatMap((p) => [
      { technicianId: p.id, status: 'APPROVED', startDate: D('2026-02-02'), endDate: D('2026-02-03') },
      { technicianId: p.id, status: 'PENDING', startDate: D('2026-09-07'), endDate: D('2026-09-08') },
    ]);
    const { prisma } = fakeDb({ orgs: [org()], users: [ADMIN, ...team], timeOffs });
    const ledger = leaveLedgerServices(prisma, calendarRules);
    calendarRules.personRulesMany.mockClear();
    await ledger.getBalance({ technicianId: 'p0', organizationId: ORG });
    expect([prisma.user.findFirst.mock.calls.length, prisma.timeOff.findMany.mock.calls.length, prisma.leaveAdjustment.findMany.mock.calls.length]).toEqual([1, 1, 1]);
    const opening = await ledger.getOpening({ organizationId: ORG, on: '2026-08-01' });
    expect(opening.rows.find((r) => r.userId === 'p7')).toMatchObject({ remaining: 23 });
    expect(prisma.timeOff.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.leaveAdjustment.findMany).toHaveBeenCalledTimes(2);
    expect(calendarRules.personRulesMany).toHaveBeenCalledTimes(2);
  });

  it('the WORK year: the window runs from the anniversary, and leave outside it does not count', async () => {
    const { prisma, db } = fakeDb({
      orgs: [org({ leaveYearMode: 'WORK_YEAR' })],
      users: [ADMIN, person('mark', { employmentStartDate: D('2020-03-15') })],
      timeOffs: [
        // Before 15 March 2026: last work year.
        { technicianId: 'mark', status: 'APPROVED', startDate: D('2026-03-09'), endDate: D('2026-03-13') },
        // Inside this work year: Mon–Fri = 5.
        { technicianId: 'mark', status: 'APPROVED', startDate: D('2026-06-01'), endDate: D('2026-06-05') },
      ],
    });
    const ledger = leaveLedgerServices(prisma, calendarRules);
    const b = await ledger.getBalance({ technicianId: 'mark', organizationId: ORG });
    expect(b.leaveYear).toEqual({ mode: 'WORK_YEAR', start: '2026-03-15', end: '2027-03-14' });
    expect(b).toMatchObject({ year: 2026, taken: 5, remaining: 20, prorated: false });
    // A request over the anniversary draws on each work year for its own days.
    db.timeOffs.push({ technicianId: 'mark', status: 'PENDING', startDate: D('2027-03-11'), endDate: D('2027-03-16') });
    expect((await ledger.getBalance({ technicianId: 'mark', organizationId: ORG })).pending).toBe(2); // Thu 11, Fri 12
  });

  describe('adjustments: write, read, undo', () => {
    it('a correction with a reason; undoing it keeps the line and gives the days back', async () => {
      const { prisma, db } = fakeDb({ orgs: [org()], users: [ADMIN, MANAGER, person('mark')] });
      const ledger = leaveLedgerServices(prisma, calendarRules);
      const added = await ledger.addAdjustment({ technicianId: 'mark', organizationId: ORG, callerId: 'anna', body: { kind: 'GRANT', days: 2, on: '2026-08-14', reason: 'Wedding' } });
      expect(added.entry).toMatchObject({ kind: 'GRANT', days: 2, source: 'MANUAL', reason: 'Wedding', createdBy: { id: 'anna' }, voidedAt: null, leaveYearStart: '2026-01-01' });
      expect(added.balance.remaining).toBe(27);

      const voided = await ledger.voidAdjustment({ adjustmentId: added.entry.id, organizationId: ORG, callerId: 'anna' });
      expect(voided.entry.voidedBy).toMatchObject({ id: 'anna' });
      expect(voided.balance.remaining).toBe(25);
      expect(db.adjustments).toHaveLength(1);
      await expect(ledger.voidAdjustment({ adjustmentId: added.entry.id, organizationId: ORG, callerId: 'anna' })).rejects.toMatchObject({ response: { code: 'ADJUSTMENT_ALREADY_VOIDED' } });

      const list = await ledger.listAdjustments({ technicianId: 'mark', organizationId: ORG, callerId: 'mark', editScope: null });
      expect(list.items).toHaveLength(1);
      expect(list.items[0]!.voidedAt).not.toBeNull();
      expect(list.canEdit).toBe(false);
    });

    it('a reason is required for a correction; only manual kinds are accepted', async () => {
      const { prisma } = fakeDb({ orgs: [org()], users: [ADMIN, MANAGER, person('mark')] });
      const ledger = leaveLedgerServices(prisma, calendarRules);
      await expect(ledger.addAdjustment({ technicianId: 'mark', organizationId: ORG, callerId: 'anna', body: { kind: 'CORRECTION', days: -1, on: '2026-08-14' } }))
        .rejects.toMatchObject({ response: { code: 'ADJUSTMENT_REASON_REQUIRED' } });
      await expect(ledger.addAdjustment({ technicianId: 'mark', organizationId: ORG, callerId: 'anna', body: { kind: 'CARRY_OVER', days: 5, on: '2026-08-14' } }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('permissions', () => {
    it('nobody adjusts their own balance — an organization administrator excepted', async () => {
      const { prisma } = fakeDb({ orgs: [org()], users: [ADMIN, MANAGER, person('mark')] });
      const ledger = leaveLedgerServices(prisma, calendarRules);
      const body = { kind: 'GRANT', days: 1, on: '2026-08-14', reason: 'x' };
      await expect(ledger.addAdjustment({ technicianId: 'anna', organizationId: ORG, callerId: 'anna', body })).rejects.toMatchObject({ response: { code: 'SELF_DECISION' } });
      await expect(ledger.saveOpening({ organizationId: ORG, callerId: 'anna', on: '2026-08-01', rows: [{ userId: 'anna', used: 3, carried: 0 }] }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(ledger.addAdjustment({ technicianId: 'owner', organizationId: ORG, callerId: 'owner', body })).resolves.toBeDefined();
    });

    it("another organization's person or line is 404, not 403", async () => {
      const other = person('eve', { organizationId: 'org-2' });
      const { prisma, db } = fakeDb({ orgs: [org(), org({ id: 'org-2' })], users: [ADMIN, MANAGER, person('mark'), other] });
      const ledger = leaveLedgerServices(prisma, calendarRules);
      await expect(ledger.getBalance({ technicianId: 'eve', organizationId: ORG })).rejects.toBeInstanceOf(NotFoundException);
      await expect(ledger.addAdjustment({ technicianId: 'eve', organizationId: ORG, callerId: 'anna', body: { kind: 'GRANT', days: 1, on: '2026-08-14', reason: 'x' } }))
        .rejects.toBeInstanceOf(NotFoundException);
      await expect(ledger.saveOpening({ organizationId: ORG, callerId: 'anna', on: '2026-08-01', rows: [{ userId: 'eve', used: 1, carried: 0 }] }))
        .rejects.toBeInstanceOf(NotFoundException);
      db.adjustments.push({ id: 'theirs', organizationId: 'org-2', userId: 'eve', kind: 'GRANT', days: 1, leaveYearStart: D('2026-01-01'), voidedAt: null });
      await expect(ledger.voidAdjustment({ adjustmentId: 'theirs', organizationId: ORG, callerId: 'anna' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a workspace manager reaches only the people of their workspaces', async () => {
      const { prisma } = fakeDb({
        orgs: [org()], users: [ADMIN, MANAGER, person('mark'), person('lisa')],
        assignments: [{ userId: 'mark', spaceId: 'gmunden' }, { userId: 'lisa', spaceId: 'linz' }],
      });
      const ledger = leaveLedgerServices(prisma, calendarRules);
      const body = { kind: 'GRANT', days: 1, on: '2026-08-14', reason: 'x' };
      await expect(ledger.addAdjustment({ technicianId: 'mark', organizationId: ORG, callerId: 'anna', scopeSpaceIds: ['gmunden'], body })).resolves.toBeDefined();
      await expect(ledger.addAdjustment({ technicianId: 'lisa', organizationId: ORG, callerId: 'anna', scopeSpaceIds: ['gmunden'], body })).rejects.toBeInstanceOf(ForbiddenException);
      const opening = await ledger.getOpening({ organizationId: ORG, scopeSpaceIds: ['gmunden'], on: '2026-08-01' });
      expect(opening.rows.map((r) => r.userId)).toEqual(['mark']);
      // The member reads their own ledger; somebody else's only in scope.
      await expect(ledger.listAdjustments({ technicianId: 'lisa', organizationId: ORG, callerId: 'mark', scopeSpaceIds: [] })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(ledger.listAdjustments({ technicianId: 'mark', organizationId: ORG, callerId: 'mark', scopeSpaceIds: [] })).resolves.toBeDefined();
    });
  });

  it('starting balances match a pasted table by email, then by full name — never by an id', async () => {
    const { prisma } = fakeDb({ orgs: [org()], users: [ADMIN, MANAGER, person('mark', { lastName: 'Weber' }), person('lisa', { lastName: 'Adler' }), person('sam', { lastName: 'Lee' }), person('sam2', { firstName: 'Sam', lastName: 'Lee' })] });
    const ledger = leaveLedgerServices(prisma, calendarRules);
    const res = await ledger.matchOpening({
      organizationId: ORG,
      text: 'person;used;carried\nMARK@example.com;10;2\nAdler, Lisa;4,5;0\nSam Lee;1;0\nnobody@x.com;1;0\nmark@example.com;3;0\nbroken;-1;0',
    });
    expect(res.matched).toEqual([
      expect.objectContaining({ line: 2, userId: 'mark', used: 10, carried: 2, by: 'EMAIL' }),
      expect.objectContaining({ line: 3, userId: 'lisa', used: 4.5, carried: 0, by: 'NAME' }),
    ]);
    expect(res.unmatched.map((u) => [u.line, u.reason])).toEqual([[4, 'AMBIGUOUS'], [5, 'NOT_FOUND'], [6, 'DUPLICATE']]);
    expect(res.errors).toEqual([{ line: 7, text: 'broken;-1;0' }]);
  });

  describe('carry-over sweep', () => {
    const setup = (over: Row = {}) => {
      const { prisma, db } = fakeDb({
        orgs: [org({ carryOverMode: 'UP_TO', carryOverMaxDays: 5, carryExpiresAfterMonths: 3, leaveTrackingStartedOn: D('2025-08-01'), ...over })],
        users: [ADMIN, person('mark')],
        timeOffs: [
          // 2025: 18 of 25 taken → 7 left; UP_TO 5 → 5 carried.
          { technicianId: 'mark', status: 'APPROVED', startDate: D('2025-09-01'), endDate: D('2025-09-24') },
        ],
      });
      const ledger = leaveLedgerServices(prisma, calendarRules);
      return { db, ledger, sweep: new LeaveCarryOverService(prisma, ledger as never) };
    };

    it('carries once on the new leave year — running twice writes once', async () => {
      const { db, ledger, sweep } = setup();
      const jan2 = new Date('2026-01-02T08:00:00Z');
      jest.setSystemTime(jan2);
      expect(await sweep.sweep(jan2)).toBeGreaterThan(0);
      const n = db.adjustments.length;
      expect(await sweep.sweep(jan2)).toBe(0);
      expect(db.adjustments).toHaveLength(n);
      const carry = db.adjustments.find((a) => a.userId === 'mark' && a.kind === 'CARRY_OVER');
      expect(carry).toMatchObject({ days: 5, sourceKey: 'carry:mark:2026-01-01', createdById: null });
      const b = await ledger.getBalance({ technicianId: 'mark', organizationId: ORG });
      expect(b).toMatchObject({ remaining: 30, carryExpiresOn: '2026-03-31' });
      expect(b.lines).toContainEqual({ key: 'CARRY_OVER', days: 5 });
    });

    it('after the expiry, what is left of the carried days expires — once', async () => {
      const { db, ledger, sweep } = setup();
      // Carried in January; 2 days taken before the end of March.
      await sweep.sweep(new Date('2026-01-02T08:00:00Z'));
      db.timeOffs.push({ technicianId: 'mark', status: 'APPROVED', startDate: D('2026-02-02'), endDate: D('2026-02-03') });
      const apr = new Date('2026-04-01T08:00:00Z');
      jest.setSystemTime(apr);
      await sweep.sweep(apr);
      await sweep.sweep(apr);
      const expired = db.adjustments.filter((a) => a.userId === 'mark' && a.kind === 'CARRY_EXPIRED');
      expect(expired).toHaveLength(1);
      expect(expired[0]).toMatchObject({ days: -3, sourceKey: 'carry-expired:mark:2026-01-01' });
      // 25 + 5 − 3 − 2 taken = 25
      expect((await ledger.getBalance({ technicianId: 'mark', organizationId: ORG })).remaining).toBe(25);
      jest.setSystemTime(new Date('2026-08-14T09:00:00Z'));
    });

    it('an undone carry is not written back; a year before HBCField counted is not carried', async () => {
      const { db, sweep } = setup();
      const jan2 = new Date('2026-01-02T08:00:00Z');
      await sweep.sweep(jan2);
      const carry = db.adjustments.find((a) => a.kind === 'CARRY_OVER' && a.userId === 'mark')!;
      carry.voidedAt = new Date();
      expect(await sweep.sweep(jan2)).toBe(0);

      const late = setup({ leaveTrackingStartedOn: D('2026-01-01') });
      expect(await late.sweep.sweep(jan2)).toBe(0);
    });

    it('PENDING leave of the old year is not carried; refused later, the carry follows', async () => {
      const { db, sweep } = setup({ carryOverMaxDays: 10 });
      // 7 left after the 18 approved; 3 more days (1–3 Dec) still waiting for a decision.
      const pending = { technicianId: 'mark', status: 'PENDING', startDate: D('2025-12-01'), endDate: D('2025-12-03') };
      db.timeOffs.push(pending);
      const jan2 = new Date('2026-01-02T08:00:00Z');
      jest.setSystemTime(jan2);
      await sweep.sweep(jan2);
      const carry = () => db.adjustments.find((a) => a.kind === 'CARRY_OVER' && a.userId === 'mark')!;
      expect(carry().days).toBe(4);
      // Approved: those days are spent — nothing moves.
      pending.status = 'APPROVED';
      expect(await sweep.sweep(jan2)).toBe(0);
      expect(carry().days).toBe(4);
      // Then cancelled: the 3 days were never spent, so they carry.
      pending.status = 'CANCELED';
      expect(await sweep.sweep(jan2)).toBe(1);
      expect(carry()).toMatchObject({ days: 7, sourceKey: 'carry:mark:2026-01-01' });
      expect(db.adjustments.filter((a) => a.kind === 'CARRY_OVER' && a.userId === 'mark')).toHaveLength(1);
      jest.setSystemTime(new Date('2026-08-14T09:00:00Z'));
    });

    it('an opening carry for the year stops the rule from carrying a second time', async () => {
      const { db, ledger, sweep } = setup();
      await ledger.saveOpening({ organizationId: ORG, callerId: 'owner', on: '2026-01-01', rows: [{ userId: 'mark', used: 0, carried: 4 }] });
      await sweep.sweep(new Date('2026-01-02T08:00:00Z'));
      expect(db.adjustments.filter((a) => a.kind === 'CARRY_OVER' && a.userId === 'mark' && !a.voidedAt)).toHaveLength(1);
    });
  });
});
