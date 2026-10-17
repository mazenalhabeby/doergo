import { PrismaClient } from '@prisma/client';
import { CustomersService } from '../customers.service';
import { customerServices, type CustomerServices } from './customer-services.fixture';

/*
  The Clients widget against a REAL database (the seeded dev org) — real role
  permissions, real rows, the SQL Prisma actually sends.

  Opt-in: `CLIENTS_WIDGET_DB=1 npx jest clients-widget-due.db` with the dev
  database up. Skipped otherwise so CI without a database stays green. Every
  row it writes carries a `cw-test-` id and is deleted in afterAll.
*/
const RUN = process.env.CLIENTS_WIDGET_DB === '1';
const d = RUN ? describe : describe.skip;

const ORG = 'cmoyg9pzs0000sbtcdb6r9de7';
const ADMIN = 'cmoyg9q1m0002sbtc6e718a1o';
const SALES = 'cmtro3iv5001fsbde4m23l5dh'; // Sales Rep — own view
const MIKE = 'emp-mike'; // Sales Manager
const NOOR = 'emp-noor'; // no CRM
const P = 'cw-test-';
const HOUR = 3_600_000;

d('Clients widget — live database', () => {
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  const queries: Array<{ query: string; params: string; duration: number }> = [];
  (prisma as any).$on('query', (e: any) => queries.push(e));
  const service = customerServices(prisma);
  const now = Date.now();
  const day = { dayStart: new Date(now - 2 * HOUR).toISOString(), dayEnd: new Date(now + 20 * HOUR).toISOString() };
  const due = (userId: string, role = 'EMPLOYEE', extra: Record<string, unknown> = {}) =>
    service.due({ organizationId: ORG, caller: { userId, role }, ...day, limit: 20, ...extra });

  const client = (id: string, over: Record<string, unknown> = {}) => ({
    id: P + id, organizationId: ORG, name: `CW ${id}`, type: 'COMPANY', createdAt: new Date(now - 60 * 86_400_000), ...over,
  });
  const reminder = (id: string, customerId: string, over: Record<string, unknown> = {}) => ({
    id: P + id, organizationId: ORG, customerId: P + customerId, type: 'REMINDER', body: `cw ${id}`,
    reminderKind: 'CALL', dueAt: new Date(now - HOUR), authorId: ADMIN, ...over,
  });

  beforeAll(async () => {
    await cleanup();
    await prisma.customer.createMany({
      data: [
        client('sales', { ownerId: SALES }),
        client('mike', { ownerId: MIKE }),
        client('shared', { ownerId: SALES, managerIds: [MIKE] }),
        client('contact', { ownerId: SALES, isContact: true }),
        client('resident', { ownerId: SALES, isPortalResident: true }),
      ] as any,
    });
    await prisma.customerActivity.createMany({
      data: [
        reminder('r-sales', 'sales', { reminderAssigneeId: SALES }),
        reminder('r-sales-unassigned', 'sales'),
        reminder('r-mike', 'mike', { reminderAssigneeId: MIKE }),
        reminder('r-mike-unassigned', 'mike'),
        // Assigned to the rep, on a client they do not manage: outside their book.
        reminder('r-mike-for-sales', 'mike', { reminderAssigneeId: SALES }),
        reminder('r-shared', 'shared', { reminderKind: 'EMAIL' }),
        reminder('r-contact', 'contact', { reminderAssigneeId: SALES }),
        reminder('r-resident', 'resident', { reminderAssigneeId: SALES }),
        reminder('r-done', 'sales', { reminderAssigneeId: SALES, doneAt: new Date() }),
        reminder('r-tomorrow', 'sales', { reminderAssigneeId: SALES, dueAt: new Date(now + 30 * HOUR) }),
        reminder('r-late', 'sales', { reminderAssigneeId: SALES, dueAt: new Date(now - 72 * HOUR) }),
      ] as any,
    });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
  async function cleanup() {
    await prisma.customerActivity.deleteMany({ where: { id: { startsWith: P } } });
    await prisma.customer.deleteMany({ where: { id: { startsWith: P } } });
  }
  const ids = (r: any) => (r.data.items as any[]).map((i) => i.id).filter((i: string) => i.startsWith(P)).sort();

  it('the Sales Rep sees their own reminders — and never another rep’s', async () => {
    const r = await due(SALES);
    expect(r.data.allowed).toBe(true);
    expect(ids(r)).toEqual([P + 'r-late', P + 'r-sales', P + 'r-sales-unassigned', P + 'r-shared'].sort());
    expect(ids(r)).not.toContain(P + 'r-mike');
    expect(ids(r)).not.toContain(P + 'r-mike-unassigned');
    expect(ids(r)).not.toContain(P + 'r-mike-for-sales');
  });

  it('the Sales Rep’s book is only what they own or co-manage — contacts and residents excluded', async () => {
    const own = await prisma.customer.count({
      where: { organizationId: ORG, isActive: true, isContact: false, isPortalResident: false, OR: [{ ownerId: SALES }, { managerIds: { has: SALES } }] },
    });
    const r = await due(SALES);
    expect(r.data.book).toBe(own);
    expect(r.data.book).toBeGreaterThanOrEqual(2);
    const all = await due(ADMIN, 'ADMIN');
    expect(all.data.book).toBeGreaterThan(r.data.book);
  });

  it('the Sales Manager gets their own reminders and the shared one; not the rep’s', async () => {
    const r = await due(MIKE);
    expect(r.data.allowed).toBe(true);
    expect(ids(r)).toEqual([P + 'r-mike', P + 'r-mike-unassigned', P + 'r-shared'].sort());
    const shared = (r.data.items as any[]).find((i) => i.id === P + 'r-shared');
    expect(shared.shared).toBe(2);
  });

  it('the admin sees the whole book but is not handed the reps’ reminders', async () => {
    const r = await due(ADMIN, 'ADMIN');
    expect(ids(r)).toEqual([]);
  });

  it('a member with no CRM gets allowed:false', async () => {
    const r = await due(NOOR);
    expect(r.data).toMatchObject({ allowed: false, items: [], book: 0 });
  });

  it('CRM off everywhere → allowed:false for the rep too', async () => {
    const r = await due(SALES, 'EMPLOYEE', { crmOn: false });
    expect(r.data.allowed).toBe(false);
  });

  it('overdue counts what was due before the day started; tomorrow and done never appear', async () => {
    const r = await due(SALES);
    const mine = (r.data.items as any[]).filter((i) => i.id.startsWith(P));
    expect(mine.map((i) => i.id)).not.toContain(P + 'r-tomorrow');
    expect(mine.map((i) => i.id)).not.toContain(P + 'r-done');
    expect(r.data.counts.overdue).toBeGreaterThanOrEqual(1);
  });

  it('completing a reminder takes it off the widget on the next read', async () => {
    await service.updateActivity({ id: P + 'r-sales', customerId: P + 'sales', organizationId: ORG, caller: { userId: SALES, role: 'EMPLOYEE' }, done: true } as any);
    const r = await due(SALES);
    expect(ids(r)).not.toContain(P + 'r-sales');
    await prisma.customerActivity.update({ where: { id: P + 'r-sales' }, data: { doneAt: null } });
  });

  it('a rep cannot complete another rep’s reminder', async () => {
    await expect(
      service.updateActivity({ id: P + 'r-mike', customerId: P + 'mike', organizationId: ORG, caller: { userId: SALES, role: 'EMPLOYEE' }, done: true } as any),
    ).rejects.toBeTruthy();
    const row = await prisma.customerActivity.findUnique({ where: { id: P + 'r-mike' } });
    expect(row?.doneAt).toBeNull();
  });

  it('performance: a bounded number of statements for a rep, and the reminder read can use the due index', async () => {
    queries.length = 0;
    const t0 = Date.now();
    await due(SALES);
    const ms = Date.now() - t0;
    const sent = queries.filter((q) => !/^(BEGIN|COMMIT|DEALLOCATE)/.test(q.query));
    /*
      Prisma splits relation reads, so 7 statements: user + role (caps),
      reminders + their clients, cold count, book count, and ONE grouped query
      that finds the longest-waiting client across the whole book. The number
      does not grow with the book.
    */
    expect(sent).toHaveLength(7);
    expect(sent.some((q) => /MAX\(/.test(q.query) && q.query.includes('GROUP BY'))).toBe(true);
    expect(ms).toBeLessThan(500);

    const reminderSql = sent.find((q) => q.query.includes('"customer_activities"') && q.query.includes('ORDER BY'))!;
    const params = JSON.parse(reminderSql.params).map((v: unknown) =>
      typeof v === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)? UTC$/.test(v) ? new Date(v.replace(' UTC', 'Z').replace(' ', 'T')) : v);
    // The dev org is tiny, so the planner rightly prefers a scan; turned off (on ONE connection) to prove the index is usable.
    const explain = (sql: string, off: boolean) => prisma.$transaction(async (tx) => {
      if (off) await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return (await tx.$queryRawUnsafe<any[]>(`EXPLAIN ANALYZE ${sql}`, ...params)).map((r) => r['QUERY PLAN']).join('\n');
    });
    const natural = await explain(reminderSql.query, false);
    const plan = await explain(reminderSql.query, true);
    if (process.env.CLIENTS_WIDGET_PLANS) {
      // eslint-disable-next-line no-console
      console.log(sent.map((q) => `${q.duration}ms ${q.query.slice(0, 160)}`).join('\n') + '\n\nnatural plan:\n' + natural + '\n\nseqscan off:\n' + plan);
    }
    expect(plan).toMatch(/customer_activities_organizationId_type_doneAt_dueAt_idx/);
  });
});
