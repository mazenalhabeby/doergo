import { stretchWorkingDays } from './request-rule-facts';

/*
  Leave is judged on the whole stretch it belongs to: two 4-day requests back to back (or with only a weekend
  between) are 8 working days under a "5 or more" rule — never two decisions of 4.
*/
describe('stretchWorkingDays', () => {
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
  const row = {
    id: 'r2',
    technicianId: 'm',
    kind: 'VACATION',
    spaceId: null,
    startDate: day('2026-11-09'), // Mon
    endDate: day('2026-11-12'), // Thu
    workingDays: 4,
    technician: { spaceAssignments: [] },
  };
  const prisma = (others: Array<{ startDate: Date; endDate: Date; workingDays: number | null }>) =>
    ({ timeOff: { findMany: jest.fn().mockResolvedValue(others) } }) as never;

  it('a request right before it (Mon–Thu, then Fri) counts together', async () => {
    const after = { startDate: day('2026-11-13'), endDate: day('2026-11-13'), workingDays: 1 };
    expect(await stretchWorkingDays(prisma([after]), row, 4)).toBe(5);
  });

  it('only a weekend between: still one stretch (Mon–Thu of the week before, through Fri)', async () => {
    const before = { startDate: day('2026-11-02'), endDate: day('2026-11-06'), workingDays: 5 };
    expect(await stretchWorkingDays(prisma([before]), row, 4)).toBe(9);
  });

  it('a working day between them: separate stretches', async () => {
    const later = { startDate: day('2026-11-17'), endDate: day('2026-11-18'), workingDays: 2 };
    expect(await stretchWorkingDays(prisma([later]), row, 4)).toBe(4);
  });

  it('chains through a second request', async () => {
    const a = { startDate: day('2026-11-13'), endDate: day('2026-11-13'), workingDays: 1 };
    const b = { startDate: day('2026-11-16'), endDate: day('2026-11-17'), workingDays: 2 };
    expect(await stretchWorkingDays(prisma([b, a]), row, 4)).toBe(7);
  });

  it('changed hours and other non-absence kinds are judged on their own', async () => {
    expect(await stretchWorkingDays(prisma([]), { ...row, kind: 'HOURS' }, 1)).toBe(1);
  });
});
