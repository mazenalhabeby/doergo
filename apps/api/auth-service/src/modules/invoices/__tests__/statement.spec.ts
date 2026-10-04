import { StatementService } from '../statement.service';

/**
 * A worker's statement: same hours as the invoice, at THEIR rate with us, as it
 * stood on the day of each job.
 */
describe('StatementService', () => {
  const D = (s: string) => new Date(`${s}T12:00:00Z`);
  const job = (id: string, day: string, hours: number) => ({
    id, updatedAt: D(day), spaceId: 's1',
    space: { id: 's1', name: 'BILLA', timezone: 'Europe/Vienna', costRateCents: null },
    serviceReport: { workDuration: hours * 3600, completedAt: D(day) },
  });
  const row = (cents: number, from: string) => ({
    target: 'MEMBER', targetId: 'mark', spaceId: null, kind: 'COST_HOUR', cents,
    effectiveFrom: new Date(`${from}T00:00:00Z`), createdAt: new Date('2026-01-01'),
  });

  const prisma: any = {
    user: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn().mockResolvedValue({ name: 'HBC', costRateCents: null, timezone: 'Europe/Vienna' }) },
    task: { findMany: jest.fn() },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    rateHistory: { findMany: jest.fn() },
  };
  const service = new StatementService(prisma);

  beforeEach(() => {
    prisma.user.findFirst.mockResolvedValue({ id: 'mark', firstName: 'Mark', lastName: 'Weber', isExternal: false, costRateCents: 2800 });
    prisma.task.findMany.mockResolvedValue([job('t1', '2026-10-10', 4), job('t2', '2026-10-25', 6)]);
    prisma.rateHistory.findMany.mockResolvedValue([row(2500, '1970-01-01'), row(2800, '2026-10-20')]);
  });

  it('prices each job at the rate of its own day, one line per rate', async () => {
    const r: any = await service.forMember({ organizationId: 'org', memberId: 'mark', from: '2026-10-01', to: '2026-10-31' });
    expect(r.data.lines.map((l: any) => [l.hours, l.rateCents, l.amountCents, l.rateLevel])).toEqual([
      [4, 2500, 10000, 'member'],
      [6, 2800, 16800, 'member'],
    ]);
    expect(r.data.totalCents).toBe(26800);
    expect(r.data.totalHours).toBe(10);
  });

  it('says so when no rate exists anywhere, rather than a silent zero', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'mark', firstName: 'M', lastName: 'W', isExternal: false, costRateCents: null });
    prisma.rateHistory.findMany.mockResolvedValue([]);
    const r: any = await service.forMember({ organizationId: 'org', memberId: 'mark' });
    expect(r.data.missingRate).toBe(true);
    expect(r.data.totalCents).toBe(0);
  });

  it('there is no statement from us for an external member, and none for a stranger', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'x', isExternal: true });
    expect((await service.forMember({ organizationId: 'org', memberId: 'x' })).statusCode).toBe(400);
    prisma.user.findFirst.mockResolvedValueOnce(null);
    expect((await service.forMember({ organizationId: 'org', memberId: 'y' })).statusCode).toBe(404);
  });

  it('refuses a period that is not two real days in order', async () => {
    expect((await service.forMember({ organizationId: 'org', memberId: 'mark', from: '2026-10-31', to: '2026-10-01' })).statusCode).toBe(400);
    expect((await service.forMember({ organizationId: 'org', memberId: 'mark', from: '2026-02-30' })).statusCode).toBe(400);
  });
});
