import { ShiftInstancesService, isMemberAt } from '../shifts/shift-instances.service';
import { NoShowSettleService } from '../no-shows/no-show-settle.service';
import { ShiftResolverService } from '../core/shift-resolver.service';

/**
 * Phantom no-shows: the materializer planned days the rota row was not yet in force (a row
 * starting next Monday planned this week), people no longer on the workspace's roster, archived
 * workspaces and deactivated members. Each became a missed shift nobody could have worked.
 */
const NOW = new Date('2026-11-02T06:00:00.000Z'); // Mon 07:00 Vienna
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

const rotaRow = (o: Record<string, unknown> = {}) => ({
  id: 'sa-1',
  userId: 'u1',
  spaceId: 'sp-1',
  shiftId: 'sh-1',
  recurrence: 'DAILY',
  daysOfWeek: [],
  daysOfMonth: [],
  dates: [],
  effectiveFrom: day('2026-11-03'),
  effectiveTo: null,
  isActive: true,
  shift: { id: 'sh-1', startLocal: '08:00', endLocal: '16:00', crossesMidnight: false, isActive: true },
  space: { id: 'sp-1', organizationId: 'org-1', timezone: 'Europe/Vienna', lat: 47.9, lng: 13.8 },
  user: { id: 'u1', timezone: null, organization: { timezone: 'Europe/Vienna' } },
  ...o,
});

function materializer(rows: unknown[], members: unknown[]) {
  const prisma = {
    shiftAssignment: { findMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValue([]) },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue(members) },
    shiftInstance: { createMany: jest.fn().mockImplementation(({ data }) => ({ count: data.length })) },
  };
  const svc = new ShiftInstancesService(prisma as never, new ShiftResolverService(prisma as never));
  return { svc, prisma };
}
const member = { userId: 'u1', spaceId: 'sp-1', effectiveFrom: day('2026-01-01'), effectiveTo: null };

describe('materializer — only days somebody can really be expected', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('skips the days before the rota row starts (effectiveFrom Tue 3 Nov)', async () => {
    const { svc, prisma } = materializer([rotaRow()], [member]);
    await svc.materializeShiftInstances(40);
    const days = prisma.shiftInstance.createMany.mock.calls.flatMap((c) => c[0].data.map((d: any) => d.localDate));
    expect(days).toEqual(['2026-11-03']);
  });

  it('asks only active workspaces and active, on-the-clock members', async () => {
    const { svc, prisma } = materializer([], []);
    await svc.materializeShiftInstances(40);
    const where = prisma.shiftAssignment.findMany.mock.calls[0][0].where;
    expect(where.user).toEqual({ clockOff: false, isActive: true });
    expect(where.space).toEqual({ isActive: true });
  });

  it('nobody off the workspace roster is expected there', async () => {
    const { svc, prisma } = materializer([rotaRow({ effectiveFrom: day('2026-10-01') })], []);
    await svc.materializeShiftInstances(40);
    expect(prisma.shiftInstance.createMany).not.toHaveBeenCalled();
  });

  it('a roster that ends before the shift starts plans nothing', () => {
    const m = { effectiveFrom: day('2026-01-01'), effectiveTo: new Date('2026-11-02T12:00:00Z') };
    expect(isMemberAt(m, new Date('2026-11-02T07:00:00Z'))).toBe(true);
    expect(isMemberAt(m, new Date('2026-11-03T07:00:00Z'))).toBe(false);
  });
});

describe('no-show settle — SHIFT_REMOVED by local day, roster and workspace', () => {
  const inst = {
    id: 'i1',
    organizationId: 'org-1',
    userId: 'u1',
    spaceId: 'sp-1',
    shiftId: 'sh-1',
    localDate: '2026-11-02',
    expectedClockInAt: new Date('2026-11-02T07:00:00Z'),
    expectedClockOutAt: new Date('2026-11-02T15:00:00Z'),
  };
  function settler(o: { rota?: unknown[]; members?: unknown[]; spaceActive?: boolean }) {
    const prisma = {
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      timeOff: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', isActive: true, organizationId: 'org-1' }]) },
      shiftAssignment: { findMany: jest.fn().mockResolvedValue(o.rota ?? [rotaRow({ effectiveFrom: day('2026-10-01') })]) },
      spaceAssignment: { findMany: jest.fn().mockResolvedValue(o.members ?? [member]) },
      companyLocation: { findMany: jest.fn().mockResolvedValue([{ id: 'sp-1', isActive: o.spaceActive ?? true }]) },
    };
    return new NoShowSettleService(prisma as never, new ShiftResolverService(prisma as never));
  }
  const now = new Date('2026-11-03T12:00:00Z');

  it('still planned → stays open', async () => {
    expect((await settler({}).judge([inst], now)).get('i1')).toBeNull();
  });

  it('a rota row starting the NEXT day no longer plans it (the ±14 h padding said it did)', async () => {
    const v = await settler({ rota: [rotaRow({ effectiveFrom: day('2026-11-03') })] }).judge([inst], now);
    expect(v.get('i1')).toEqual({ state: 'EXCUSED', reason: 'SHIFT_REMOVED' });
  });

  it('a rota row that ENDED the day before no longer plans it', async () => {
    const rota = [rotaRow({ effectiveFrom: day('2026-10-01'), effectiveTo: day('2026-11-01') })];
    const v = await settler({ rota }).judge([inst], now);
    expect(v.get('i1')).toEqual({ state: 'EXCUSED', reason: 'SHIFT_REMOVED' });
  });

  it('the member is no longer on the workspace roster', async () => {
    const members = [{ ...member, effectiveTo: new Date('2026-11-03T08:00:00Z') }];
    const v = await settler({ members }).judge([inst], now);
    expect(v.get('i1')).toEqual({ state: 'EXCUSED', reason: 'SHIFT_REMOVED' });
  });

  it('the workspace is archived', async () => {
    const v = await settler({ spaceActive: false }).judge([inst], now);
    expect(v.get('i1')).toEqual({ state: 'EXCUSED', reason: 'SHIFT_REMOVED' });
  });
});
