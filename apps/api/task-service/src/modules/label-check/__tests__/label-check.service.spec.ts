import { LabelCheckService } from '../label-check.service';

/** Wednesday 2026-10-14, 03:15 in Vienna (01:15Z): the night of the 13th is due. */
const NOW = new Date('2026-10-14T01:15:00.000Z');
const facts = {
  shift: {
    id: 's1',
    name: null,
    expectedStartAt: '2026-10-13T06:00:00.000Z',
    expectedEndAt: '2026-10-13T14:00:00.000Z',
    toleranceMin: 10,
    endIsDailyLimit: false,
  },
  firstOfShift: true,
  clockIn: { judged: true, metresOutside: 0 },
};
const row = (id: string, clockIn: string, flags: string[]) => ({
  id,
  clockInAt: new Date(clockIn),
  clockOutAt: new Date('2026-10-13T14:00:00.000Z'),
  flagReasons: flags,
  approvalStatus: flags.length ? 'PENDING' : 'AUTO',
  approvedById: null,
  labelFacts: facts,
});

function harness(rows: ReturnType<typeof row>[], claimed = 1) {
  const prisma = {
    organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org1', timezone: 'Europe/Vienna' }]) },
    labelCheckRun: { createMany: jest.fn().mockResolvedValue({ count: claimed }), update: jest.fn() },
    labelCheckFinding: { createMany: jest.fn() },
    timeEntry: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  return { prisma, svc: new LabelCheckService(prisma as never) };
}

describe('LabelCheckService', () => {
  it('checks last night once, in the organization zone, and finds nothing on clean data', async () => {
    const { prisma, svc } = harness([row('e1', '2026-10-13T06:02:00.000Z', [])]);
    expect(await svc.sweep(NOW)).toEqual([
      { organizationId: 'org1', localDate: '2026-10-13', checked: 1, mismatches: 0 },
    ]);
    expect(prisma.labelCheckFinding.createMany).not.toHaveBeenCalled();
    const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: 'org1', labelRules: { not: null }, status: { not: 'CLOCKED_IN' } });
  });

  it('records a mismatch and never writes to the entry', async () => {
    const { prisma, svc } = harness([
      row('e1', '2026-10-13T06:40:00.000Z', []), // late, unlabelled
      row('e0', '2026-10-12T06:40:00.000Z', []), // the night before: not this night
    ]);
    const [run] = await svc.sweep(NOW);
    expect(run).toMatchObject({ checked: 1, mismatches: 1 });
    const data = prisma.labelCheckFinding.createMany.mock.calls[0][0].data[0];
    expect(data).toMatchObject({ entryId: 'e1', localDate: '2026-10-13', expected: { labels: ['LATE_ARRIVAL'] } });
    expect(Object.keys(prisma.timeEntry)).toEqual(['findMany']);
  });

  it('a night already claimed is not read again; before 03:00 local nothing runs', async () => {
    const claimedElsewhere = harness([], 0);
    expect(await claimedElsewhere.svc.sweep(NOW)).toEqual([]);
    expect(claimedElsewhere.prisma.timeEntry.findMany).not.toHaveBeenCalled();
    const early = harness([]);
    expect(await early.svc.sweep(new Date('2026-10-13T23:30:00.000Z'))).toEqual([]);
    expect(early.prisma.labelCheckRun.createMany).not.toHaveBeenCalled();
  });
});
