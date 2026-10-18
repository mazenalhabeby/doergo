
import { customerServices, type CustomerServices } from './customer-services.fixture';

/*
  GET /customers/due — the home Clients widget. What the query is ASKED, for
  every caller shape: who gets nothing, whose book it reads, which reminders
  count as theirs, and how far the phone may move "today".
*/

const ORG = 'org-1';
const HOUR = 3_600_000;

describe('customers due() — the Clients widget', () => {
  let service: CustomerServices;
  const prisma: Record<string, any> = {
    user: { findFirst: jest.fn() },
    customerActivity: { findMany: jest.fn(), groupBy: jest.fn() },
    customer: { count: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  /** The longest-waiting query's SQL text and bound values. */
  const coldSql = () => {
    const q = prisma.$queryRaw.mock.calls[0][0];
    return { text: (q.strings ?? q.sql ?? []).join ? (q.strings ?? []).join('?') : String(q.sql), values: q.values as unknown[] };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.customerActivity.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customerActivity.groupBy.mockResolvedValue([]);
    prisma.customerActivity.count = jest.fn().mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([]);
    service = customerServices(prisma);
  });

  const rep = (permissions: Record<string, boolean>) => prisma.user.findFirst.mockResolvedValue({ role: 'EMPLOYEE', memberRole: { isActive: true, permissions } });
  const reminderWhere = () => prisma.customerActivity.findMany.mock.calls[0][0].where;
  const bookWhere = () => prisma.customer.count.mock.calls[1][0].where;

  describe('who gets an answer', () => {
    it('no caller → allowed:false and no query', async () => {
      const r = await service.due({ organizationId: ORG });
      expect(r.data.allowed).toBe(false);
      expect(prisma.customerActivity.findMany).not.toHaveBeenCalled();
    });

    it('a member with no CRM permission → allowed:false, nothing read', async () => {
      rep({ canCreateTasks: true });
      const r = await service.due({ organizationId: ORG, caller: { userId: 'u9', role: 'EMPLOYEE' } });
      expect(r.data).toMatchObject({ allowed: false, items: [], total: 0, book: 0 });
      expect(prisma.customerActivity.findMany).not.toHaveBeenCalled();
      expect(prisma.customer.count).not.toHaveBeenCalled();
    });

    it('CRM switched off in every workspace → allowed:false even for an admin, with no role lookup', async () => {
      const r = await service.due({ organizationId: ORG, caller: { userId: 'a', role: 'ADMIN' }, crmOn: false });
      expect(r.data.allowed).toBe(false);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.customerActivity.findMany).not.toHaveBeenCalled();
    });

    it('a member of ANOTHER organization resolves to no CRM (role looked up in this org)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const r = await service.due({ organizationId: ORG, caller: { userId: 'stranger', role: 'EMPLOYEE' } });
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'stranger', organizationId: ORG });
      expect(r.data.allowed).toBe(false);
    });
  });

  describe('whose book', () => {
    it('own-view rep: the book, the reminders AND going-cold are all narrowed to clients they own or co-manage', async () => {
      rep({ crmViewOwn: true, crmWork: true });
      await service.due({ organizationId: ORG, caller: { userId: 'rep1', role: 'EMPLOYEE' } });
      const own = { OR: [{ ownerId: 'rep1' }, { managerIds: { has: 'rep1' } }] };
      expect(reminderWhere().AND[0].customer).toMatchObject({ organizationId: ORG, ...own });
      expect(bookWhere()).toMatchObject(own);
      expect(prisma.customer.count.mock.calls[0][0].where).toMatchObject(own);
      // Going cold's longest-waiting is narrowed the same way, in SQL.
      const { text, values } = coldSql();
      expect(text).toContain('"ownerId"');
      expect(text).toContain('"managerIds"');
      expect(values).toContain('rep1');
    });

    it('view-all: the longest-waiting query is NOT narrowed to one owner', async () => {
      rep({ crmViewAll: true });
      await service.due({ organizationId: ORG, caller: { userId: 'mgr', role: 'EMPLOYEE' } });
      expect(coldSql().text).not.toContain('"ownerId"');
    });

    it('view-all role: the whole book, but still only reminders that are THEIRS', async () => {
      rep({ crmViewAll: true });
      await service.due({ organizationId: ORG, caller: { userId: 'mgr', role: 'EMPLOYEE' } });
      expect(bookWhere().OR).toBeUndefined();
      const mine = reminderWhere().AND[1].OR;
      expect(mine).toEqual([
        { reminderAssigneeId: 'mgr' },
        { reminderAssigneeId: null, customer: { OR: [{ ownerId: 'mgr' }, { managerIds: { has: 'mgr' } }] } },
        { reminderAssigneeId: null, authorId: 'mgr', customer: { ownerId: null, managerIds: { isEmpty: true } } },
      ]);
    });

    it('contacts, portal residents and archived clients are never in the book', async () => {
      await service.due({ organizationId: ORG, caller: { userId: 'a', role: 'ADMIN' } });
      expect(bookWhere()).toMatchObject({ organizationId: ORG, isActive: true, isContact: false, isPortalResident: false });
      expect(reminderWhere().AND[0].customer).toMatchObject({ isContact: false, isPortalResident: false, isActive: true });
    });

    it('only OPEN reminders of THIS organization', async () => {
      await service.due({ organizationId: ORG, caller: { userId: 'a', role: 'ADMIN' } });
      expect(reminderWhere()).toMatchObject({ organizationId: ORG, type: 'REMINDER', doneAt: null });
    });
  });

  describe('"today" as the phone states it', () => {
    const call = async (dayStart?: string, dayEnd?: string) => {
      await service.due({ organizationId: ORG, caller: { userId: 'a', role: 'ADMIN' }, dayStart, dayEnd });
      return reminderWhere().dueAt.lt as Date;
    };
    const utcMidnight = () => new Date(new Date().toISOString().slice(0, 10)).getTime();

    it('a real local day (Vienna, 24h) is used as sent', async () => {
      const s = new Date(Date.now() - 3 * HOUR);
      const e = new Date(s.getTime() + 24 * HOUR - 1);
      expect((await call(s.toISOString(), e.toISOString())).getTime()).toBe(e.getTime());
    });

    it('a DST day of 25 hours is accepted', async () => {
      const s = new Date(Date.now() - 3 * HOUR);
      const e = new Date(s.getTime() + 25 * HOUR - 1);
      expect((await call(s.toISOString(), e.toISOString())).getTime()).toBe(e.getTime());
    });

    it('garbage, one end missing, or nothing → the UTC day', async () => {
      for (const [s, e] of [['garbage', 'x'], [new Date().toISOString(), undefined], [undefined, undefined]] as const) {
        jest.clearAllMocks();
        prisma.customerActivity.findMany.mockResolvedValue([]);
        expect((await call(s, e)).getTime()).toBe(utcMidnight() + 86_400_000);
      }
    });

    it('BUG FIXED: a reversed window falls back instead of counting everything as late', async () => {
      const s = new Date(Date.now() + 10 * HOUR).toISOString();
      const e = new Date(Date.now() - 10 * HOUR).toISOString();
      expect((await call(s, e)).getTime()).toBe(utcMidnight() + 86_400_000);
    });

    it('BUG FIXED: a four-day window cannot pull tomorrow’s reminders into today', async () => {
      const s = new Date(Date.now() - 47 * HOUR).toISOString();
      const e = new Date(Date.now() + 47 * HOUR).toISOString();
      expect((await call(s, e)).getTime()).toBe(utcMidnight() + 86_400_000);
    });

    it('a window far from now (a year out) is refused', async () => {
      const s = new Date(Date.now() + 365 * 86_400_000).toISOString();
      const e = new Date(Date.now() + 365 * 86_400_000 + 20 * HOUR).toISOString();
      expect((await call(s, e)).getTime()).toBe(utcMidnight() + 86_400_000);
    });
  });

  describe('counts and rows', () => {
    const now = Date.now();
    const row = (id: string, kind: string | null, dueOffsetH: number, over: Record<string, unknown> = {}) => ({
      id, customerId: `c-${id}`, body: null, dueAt: new Date(now + dueOffsetH * HOUR), reminderKind: kind, reminderAssigneeId: 'a',
      customer: { name: id, type: 'COMPANY', phone: '+43 1', email: 'x@y.z', ownerId: 'a', managerIds: [] },
      ...over,
    });
    const run = (limit?: number) => service.due({
      organizationId: ORG, caller: { userId: 'a', role: 'ADMIN' }, limit,
      dayStart: new Date(now - 2 * HOUR).toISOString(), dayEnd: new Date(now + 20 * HOUR).toISOString(),
    });

    it('overdue = due before the start of the member’s day; kinds split; MEETING reads as other', async () => {
      prisma.customerActivity.findMany.mockResolvedValue([
        row('late', 'CALL', -30), row('today', 'EMAIL', 1), row('old', 'MEETING', -5), row('none', null, 3),
      ]);
      const r = await run(20);
      expect(r.data.counts).toEqual({ call: 1, email: 1, other: 2, overdue: 2 });
      expect(r.data.total).toBe(4);
      expect(r.data.items.map((i: any) => i.kind)).toEqual(['CALL', 'EMAIL', 'OTHER', 'OTHER']);
    });

    it('a phone number only on a CALL row, an address only on an EMAIL row', async () => {
      prisma.customerActivity.findMany.mockResolvedValue([row('c', 'CALL', 1), row('e', 'EMAIL', 1), row('o', 'OTHER', 1)]);
      const [c, e, o] = (await run()).data.items as any[];
      expect([c.phone, c.email]).toEqual(['+43 1', null]);
      expect([e.phone, e.email]).toEqual([null, 'x@y.z']);
      expect([o.phone, o.email]).toEqual([null, null]);
    });

    it('shared = how many manage an UNASSIGNED reminder; an assigned one is nobody else’s', async () => {
      prisma.customerActivity.findMany.mockResolvedValue([
        row('s', 'CALL', 1, { reminderAssigneeId: null, customer: { name: 's', type: 'COMPANY', phone: null, email: null, ownerId: 'a', managerIds: ['b', 'c', 'a'] } }),
        row('t', 'CALL', 1, { customer: { name: 't', type: 'COMPANY', phone: null, email: null, ownerId: 'a', managerIds: ['b'] } }),
      ]);
      const [s, t] = (await run()).data.items as any[];
      expect(s.shared).toBe(3);
      expect(t.shared).toBe(0);
    });

    it('limit: 5 by default, clamped to 1..20, and garbage is the default — never an empty card', async () => {
      prisma.customerActivity.findMany.mockResolvedValue(Array.from({ length: 30 }, (_, i) => row(`r${i}`, 'CALL', 1)));
      expect((await run()).data.items).toHaveLength(5);
      expect((await run(0)).data.items).toHaveLength(1);
      expect((await run(-4)).data.items).toHaveLength(1);
      expect((await run(999)).data.items).toHaveLength(20);
      expect((await run(3.9)).data.items).toHaveLength(3);
      expect((await run(NaN)).data.items).toHaveLength(5);
      expect((await run('abc' as unknown as number)).data.items).toHaveLength(5);
      // …while the total still counts every one.
      expect((await run(1)).data.total).toBe(30);
    });

    it('the reminder read is bounded, whatever the book holds', async () => {
      await run();
      expect(prisma.customerActivity.findMany.mock.calls[0][0].take).toBe(200);
    });

    it('BUG FIXED: more than 200 open reminders → the total and counts come from the database', async () => {
      prisma.customerActivity.findMany.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({
        id: `r${i}`, customerId: 'c', body: null, dueAt: new Date(), reminderKind: 'CALL', reminderAssigneeId: 'u',
        customer: { name: 'X', type: 'COMPANY', phone: null, email: null, ownerId: 'u', managerIds: [] },
      })));
      prisma.customerActivity.groupBy.mockResolvedValue([
        { reminderKind: 'CALL', _count: { _all: 250 } }, { reminderKind: 'EMAIL', _count: { _all: 40 } }, { reminderKind: null, _count: { _all: 10 } },
      ]);
      prisma.customerActivity.count.mockResolvedValue(120);
      const r = await service.due({ organizationId: ORG, caller: { userId: 'u', role: 'ADMIN' } });
      expect(r.data.total).toBe(300);
      expect(r.data.counts).toEqual({ call: 250, email: 40, other: 10, overdue: 120 });
    });

    it('under the cap, no extra counting query', async () => {
      await run();
      expect(prisma.customerActivity.groupBy).not.toHaveBeenCalled();
      expect(prisma.customerActivity.count).not.toHaveBeenCalled();
    });
  });

  describe('going cold', () => {
    const DAY = 86_400_000;
    it('carries the rule it used and the client who has waited longest', async () => {
      prisma.customer.count.mockResolvedValueOnce(3).mockResolvedValueOnce(12);
      prisma.$queryRaw.mockResolvedValue([{ id: 'b', name: 'Never', since: new Date(Date.now() - 90 * DAY), last: null }]);
      const r = await service.due({ organizationId: ORG, caller: { userId: 'u', role: 'ADMIN' } });
      expect(r.data.book).toBe(12);
      expect(r.data.cold).toEqual({ count: 3, days: 30, longest: { id: 'b', name: 'Never', days: 90, never: true } });
    });

    it('BUG FIXED: the longest-waiting is asked of the WHOLE book, oldest last contact first, one row', async () => {
      await service.due({ organizationId: ORG, caller: { userId: 'u', role: 'ADMIN' } });
      const { text, values } = coldSql();
      expect(text).toMatch(/MAX\(a\."createdAt"\)/);
      expect(text).toMatch(/ORDER BY since ASC\s+LIMIT 1/);
      expect(text).not.toMatch(/LIMIT 200/);
      expect(values).toContainEqual(['NOTE', 'CALL', 'EMAIL', 'MEETING']);
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
    });

    it('a client contacted 45 days ago reads as 45 days, not "never"', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'a', name: 'Old contact', since: new Date(Date.now() - 45 * DAY), last: new Date(Date.now() - 45 * DAY) }]);
      const r = await service.due({ organizationId: ORG, caller: { userId: 'u', role: 'ADMIN' } });
      expect(r.data.cold.longest).toEqual({ id: 'a', name: 'Old contact', days: 45, never: false });
    });

    it('only CONTACT counts: a reminder or a stage change does not warm a client up', async () => {
      await service.due({ organizationId: ORG, caller: { userId: 'u', role: 'ADMIN' } });
      const where = prisma.customer.count.mock.calls[0][0].where;
      expect(where.activities.none.type.in).toEqual(['NOTE', 'CALL', 'EMAIL', 'MEETING']);
      expect(where.createdAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - 30 * DAY);
    });

    it('one read for reminders, three for the book — and one role lookup for a non-admin', async () => {
      rep({ crmViewAll: true });
      await service.due({ organizationId: ORG, caller: { userId: 'm', role: 'EMPLOYEE' } });
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.customerActivity.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.customer.count).toHaveBeenCalledTimes(2);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
