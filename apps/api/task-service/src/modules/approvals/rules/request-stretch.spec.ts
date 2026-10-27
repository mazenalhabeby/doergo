import { restGapOf, stretchWorkingDays, type RestGap } from './leave-stretch';

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
  // Days off = Saturday and Sunday, plus a public holiday on Wed 2026-11-11 when asked.
  const restDays =
    (holidays: string[] = []): RestGap =>
    async (from, to) => {
      for (let d = from.getTime(); d <= to.getTime(); d += 86_400_000) {
        const at = new Date(d);
        const dow = at.getUTCDay();
        if (dow !== 0 && dow !== 6 && !holidays.includes(at.toISOString().slice(0, 10))) return false;
      }
      return true;
    };
  const rest = restDays();
  const prisma = (others: Array<{ startDate: Date; endDate: Date; workingDays: number | null }>) =>
    ({ timeOff: { findMany: jest.fn().mockResolvedValue(others) } }) as never;

  it('a request right before it (Mon–Thu, then Fri) counts together', async () => {
    const after = { startDate: day('2026-11-13'), endDate: day('2026-11-13'), workingDays: 1 };
    expect(await stretchWorkingDays(prisma([after]), row, 4, rest)).toBe(5);
  });

  it('only a weekend between: still one stretch (Mon–Thu of the week before, through Fri)', async () => {
    const before = { startDate: day('2026-11-02'), endDate: day('2026-11-06'), workingDays: 5 };
    expect(await stretchWorkingDays(prisma([before]), row, 4, rest)).toBe(9);
  });

  it('a working day between them: separate stretches', async () => {
    const later = { startDate: day('2026-11-17'), endDate: day('2026-11-18'), workingDays: 2 };
    expect(await stretchWorkingDays(prisma([later]), row, 4, rest)).toBe(4);
  });

  it('chains through a second request', async () => {
    const a = { startDate: day('2026-11-13'), endDate: day('2026-11-13'), workingDays: 1 };
    const b = { startDate: day('2026-11-16'), endDate: day('2026-11-17'), workingDays: 2 };
    expect(await stretchWorkingDays(prisma([b, a]), row, 4, rest)).toBe(7);
  });

  it('changed hours and other non-absence kinds are judged on their own', async () => {
    expect(await stretchWorkingDays(prisma([]), { ...row, kind: 'HOURS' }, 1, rest)).toBe(1);
  });

  it("a public holiday between them joins them too (from the person's own calendar)", async () => {
    const early = { ...row, startDate: day('2026-11-16'), endDate: day('2026-11-17') }; // Mon–Tue
    const later = { startDate: day('2026-11-19'), endDate: day('2026-11-20'), workingDays: 2 }; // Thu–Fri
    expect(await stretchWorkingDays(prisma([later]), early, 2, restDays(['2026-11-18']))).toBe(4);
    expect(await stretchWorkingDays(prisma([later]), early, 2, rest)).toBe(2);
  });

  it('a Friday/Saturday weekend: Sun–Thu, then the next Sun, is one stretch', async () => {
    const friSat: RestGap = async (from, to) => {
      for (let d = from.getTime(); d <= to.getTime(); d += 86_400_000)
        if (![5, 6].includes(new Date(d).getUTCDay())) return false;
      return true;
    };
    const sunThu = { ...row, startDate: day('2026-11-08'), endDate: day('2026-11-12') };
    const nextSun = { startDate: day('2026-11-15'), endDate: day('2026-11-15'), workingDays: 1 };
    expect(await stretchWorkingDays(prisma([nextSun]), sunThu, 5, friSat)).toBe(6);
  });

  it("the calendar answers from the person's own count; an unreadable calendar joins nothing", async () => {
    const counted = (n: number | Error) => ({
      countLeaveFor: jest.fn(() => (n instanceof Error ? Promise.reject(n) : Promise.resolve({ counted: n }))),
    });
    expect(await restGapOf(counted(0), 'o', 'm')(day('2026-11-14'), day('2026-11-15'))).toBe(true);
    expect(await restGapOf(counted(1), 'o', 'm')(day('2026-11-14'), day('2026-11-15'))).toBe(false);
    expect(await restGapOf(counted(new Error('down')), 'o', 'm')(day('2026-11-14'), day('2026-11-15'))).toBe(false);
  });
});
