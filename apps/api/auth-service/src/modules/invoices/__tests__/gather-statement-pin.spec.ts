import { InvoiceGatherService } from '../invoice-gather.service';
import { StatementService } from '../statement.service';

/**
 * Pins the invoice gather and the worker's statement end to end: the answer AND
 * every query asked (its arguments), for a workspace and a client source. Written
 * before both methods were split into steps, so the split is proven to change nothing.
 */
const D = (s: string) => new Date(`${s}T12:00:00Z`);
const person = (id: string, first: string, bill: number | null, cost: number | null) => ({
  id,
  firstName: first,
  lastName: 'X',
  billRateCents: bill,
  costRateCents: cost,
});
const rateRow = (
  target: string,
  targetId: string,
  kind: string,
  cents: number,
  from: string,
  spaceId: string | null = null,
) => ({
  target,
  targetId,
  spaceId,
  kind,
  cents,
  effectiveFrom: new Date(`${from}T00:00:00Z`),
  createdAt: new Date('2026-01-01'),
});

function gatherPrisma() {
  const tasks = [
    {
      id: 't1',
      title: 'Fix boiler',
      updatedAt: D('2026-10-03'),
      assignedTo: person('mark', 'Mark', null, 2000),
      serviceReport: {
        id: 'r1',
        summary: 'sum',
        workPerformed: 'did it',
        workDuration: 3 * 3600,
        completedAt: D('2026-10-02'),
        completedBy: person('anna', 'Anna', 9000, 3000),
        partsUsed: [{ name: 'Valve', partNumber: null, quantity: 2, unitCost: 12.5 }],
      },
    },
    {
      id: 't2',
      title: 'Billed already',
      updatedAt: D('2026-10-04'),
      assignedTo: person('mark', 'Mark', null, 2000),
      serviceReport: null,
    },
    {
      id: 't3',
      title: 'No report',
      updatedAt: D('2026-10-25'),
      assignedTo: person('mark', 'Mark', null, 2000),
      serviceReport: null,
    },
  ];
  return {
    companyLocation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's1',
        name: 'BILLA',
        kind: 'CUSTOMER',
        contactName: 'Mr B',
        contactEmail: 'b@x.test',
        address: 'Street 1',
        billableRateCents: 8000,
        costRateCents: null,
        timezone: 'Europe/Vienna',
        currency: null,
        legalEntityId: null,
        sourceCustomerId: null,
      }),
    },
    customer: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'c1',
          name: 'Client',
          email: 'c@x.test',
          address: null,
          currency: 'USD',
          legalEntityId: null,
        }),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ billableRateCents: 7000, costRateCents: 2500, currency: 'EUR' }),
    },
    task: { findMany: jest.fn().mockResolvedValue(tasks) },
    invoiceItem: { findMany: jest.fn().mockResolvedValue([{ taskId: null, taskIds: ['t2'] }]) },
    spaceAssignment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'a1',
          userId: 'anna',
          billRateCents: null,
          costRateCents: null,
          billBy: 'BOTH',
          hoursBasis: 'COUNTED',
          workRole: { id: 'w1', name: 'Plumber', kind: 'WORK' },
          user: { ...person('anna', 'Anna', 9000, 3000), isExternal: false },
        },
      ]),
    },
    rateHistory: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          rateRow('MEMBER', 'anna', 'BILL_HOUR', 9500, '2026-10-20'),
          rateRow('SPACE', 's1', 'BILL_HOUR', 8000, '1970-01-01'),
        ]),
    },
  };
}

function gatherService(prisma: any) {
  const siteTime = {
    gatherSiteTime: jest.fn(async (args: any) => ({
      hourEntries: [{ workerId: 'anna', hours: 2, costCents: 3000 }],
      dayEntries: [{ workerId: 'anna', days: 1, costCents: null }],
      workDays: ['2026-10-01', '2026-10-02'],
      // What the step is handed — rates resolved on a day by the passed resolver.
      seen: {
        ...args,
        book: undefined,
        ratesFor: args.ratesFor({ id: 'anna', billRateCents: 9000, costRateCents: 3000 }, '2026-10-21'),
      },
    })),
  };
  const issuer = { issuingEntity: jest.fn().mockResolvedValue({ entity: { id: 'le1', currency: null } }) };
  const service = new InvoiceGatherService(prisma, issuer as any, siteTime as any);
  return { service, siteTime };
}

const calls = (prisma: any) =>
  Object.fromEntries(
    Object.entries(prisma).flatMap(([model, fns]: any) =>
      Object.entries(fns).map(([fn, mock]: any) => [`${model}.${fn}`, mock.mock.calls]),
    ),
  );

describe('invoice gather (pinned)', () => {
  it('refuses no source and two sources', async () => {
    const { service } = gatherService(gatherPrisma());
    expect(await service.gather({ organizationId: 'o' })).toMatchSnapshot();
    expect(await service.gather({ organizationId: 'o', spaceId: 's', customerId: 'c' })).toMatchSnapshot();
  });

  it('refuses a missing space, a non-customer space and a missing client', async () => {
    const p1 = gatherPrisma();
    p1.companyLocation.findFirst.mockResolvedValue(null);
    expect(await gatherService(p1).service.gather({ organizationId: 'o', spaceId: 's1' })).toMatchSnapshot();
    const p2 = gatherPrisma();
    p2.companyLocation.findFirst.mockResolvedValue({ id: 's1', name: 'Our office', kind: 'OWN' });
    expect(await gatherService(p2).service.gather({ organizationId: 'o', spaceId: 's1' })).toMatchSnapshot();
    const p3 = gatherPrisma();
    p3.customer.findFirst.mockResolvedValue(null);
    expect(await gatherService(p3).service.gather({ organizationId: 'o', customerId: 'c1' })).toMatchSnapshot();
  });

  it('a workspace: answer, queries and the site-time step', async () => {
    const prisma = gatherPrisma();
    const { service, siteTime } = gatherService(prisma);
    const r = await service.gather({ organizationId: 'o', spaceId: 's1', from: '2026-10-01', to: '2026-10-31' });
    expect(r).toMatchSnapshot();
    expect(calls(prisma)).toMatchSnapshot();
    expect(await siteTime.gatherSiteTime.mock.results[0].value).toMatchSnapshot();
  });

  it('a client: answer and queries', async () => {
    const prisma = gatherPrisma();
    const { service, siteTime } = gatherService(prisma);
    const r = await service.gather({ organizationId: 'o', customerId: 'c1' });
    expect(r).toMatchSnapshot();
    expect(calls(prisma)).toMatchSnapshot();
    expect(siteTime.gatherSiteTime).not.toHaveBeenCalled();
  });
});

describe('worker statement (pinned)', () => {
  const job = (id: string, day: string, hours: number, space: { id: string; name: string } | null) => ({
    id,
    updatedAt: D(day),
    spaceId: space?.id ?? null,
    space: space ? { ...space, timezone: 'Europe/Vienna', costRateCents: null } : null,
    serviceReport: hours ? { workDuration: hours * 3600, completedAt: D(day) } : null,
  });
  const S1 = { id: 's1', name: 'BILLA' };
  const S2 = { id: 's2', name: 'Aldi' };

  function statementPrisma() {
    return {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'mark', firstName: 'Mark', lastName: 'W', isExternal: false, costRateCents: 2800 }),
      },
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'HBC', costRateCents: 2000, timezone: 'Europe/Vienna', currency: null }),
      },
      task: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            job('t1', '2026-10-02', 4, S1),
            job('t2', '2026-10-03', 2, S1),
            job('t3', '2026-10-05', 3, null),
            job('t4', '2026-10-22', 5, null),
            job('t5', '2026-10-06', 6, S2),
            job('t6', '2026-10-07', 0, null),
          ]),
      },
      spaceAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            spaceId: 's1',
            costRateCents: null,
            billBy: 'HOUR',
            space: { ...S1, timezone: 'Europe/Vienna', costRateCents: null },
          },
          {
            id: 'a2',
            spaceId: 's2',
            costRateCents: 3300,
            billBy: 'BOTH',
            space: { ...S2, timezone: 'Europe/Vienna', costRateCents: null },
          },
        ]),
      },
      timeEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 'mark',
            locationId: 's1',
            clockInAt: new Date('2026-10-02T06:00:00Z'),
            clockOutAt: new Date('2026-10-02T14:00:00Z'),
            paidMinutes: 450,
            totalMinutes: 480,
            location: { timezone: 'Europe/Vienna' },
          },
          {
            userId: 'mark',
            locationId: 's2',
            clockInAt: new Date('2026-10-08T06:00:00Z'),
            clockOutAt: new Date('2026-10-08T10:00:00Z'),
            paidMinutes: null,
            totalMinutes: 240,
            location: { timezone: 'Europe/Vienna' },
          },
        ]),
      },
      rateHistory: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            rateRow('MEMBER', 'mark', 'COST_HOUR', 2500, '1970-01-01'),
            rateRow('MEMBER', 'mark', 'COST_HOUR', 2800, '2026-10-20'),
            rateRow('MEMBER', 'mark', 'COST_DAY', 20000, '1970-01-01'),
            rateRow('MEMBER', 'mark', 'COST_DAY', 22000, '2026-10-07'),
          ]),
      },
    };
  }

  it('refuses a bad period, an unknown member and an external one', async () => {
    const p = statementPrisma();
    const s = new StatementService(p as any);
    expect(
      await s.forMember({ organizationId: 'o', memberId: 'mark', from: '2026-10-31', to: '2026-10-01' }),
    ).toMatchSnapshot();
    expect(await s.forMember({ organizationId: 'o', memberId: 'mark', from: 'nope' })).toMatchSnapshot();
    p.user.findFirst.mockResolvedValueOnce(null);
    expect(await s.forMember({ organizationId: 'o', memberId: 'x' })).toMatchSnapshot();
    p.user.findFirst.mockResolvedValueOnce({ id: 'e', isExternal: true });
    expect(await s.forMember({ organizationId: 'o', memberId: 'e' })).toMatchSnapshot();
  });

  it('hours, days and no-workspace lines, with the queries asked', async () => {
    const p = statementPrisma();
    const r = await new StatementService(p as any).forMember({
      organizationId: 'o',
      memberId: 'mark',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(r).toMatchSnapshot();
    expect(calls(p)).toMatchSnapshot();
  });

  it('no period: every time entry, the open-ended task filter', async () => {
    const p = statementPrisma();
    const r = await new StatementService(p as any).forMember({ organizationId: 'o', memberId: 'mark' });
    expect(r).toMatchSnapshot();
    expect(calls(p)).toMatchSnapshot();
  });
});
