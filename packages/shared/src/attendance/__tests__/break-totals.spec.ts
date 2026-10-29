import { breakTotals } from '../break-totals';

/** A day's rest totals: summed exactly, rounded once. */
describe('breakTotals', () => {
  const t = (s: number) => new Date(Date.UTC(2026, 9, 1, 9, 0, s));

  it('rounds the day once, not each rest', () => {
    // Three 40-second rests: 2 minutes in all (rounded per row they were 3 × 1 = 3).
    const rows = [0, 100, 200].map((s) => ({ startedAt: t(s), endedAt: t(s + 40), durationMinutes: 1 }));
    expect(breakTotals(rows)).toEqual({ breakMinutes: 2, unpaidBreakMinutes: 2 });
  });

  it('keeps paid rests out of the unpaid total and ignores running ones', () => {
    const rows = [
      { startedAt: t(0), endedAt: t(15 * 60), isPaid: true },
      { startedAt: t(1000), endedAt: t(1000 + 30 * 60) },
      { startedAt: t(5000) },
    ];
    expect(breakTotals(rows)).toEqual({ breakMinutes: 45, unpaidBreakMinutes: 30 });
  });
});
