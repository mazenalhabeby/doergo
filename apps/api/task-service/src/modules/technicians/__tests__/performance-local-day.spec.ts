import { MemberPerformanceService } from '../member-performance.service';

/*
  The performance chart counted hours and finished jobs on the UTC day, so a
  shift clocked in at 00:30 in Vienna (22:30 UTC the evening before) landed on
  the previous day's bar. A day is the local day of the workspace where the
  work happened — the organization's zone when the workspace names none.
*/
describe('performance trends — the local day', () => {
  const service = Object.create(MemberPerformanceService.prototype) as any;
  const start = new Date('2026-10-09T00:00:00Z');
  const end = new Date('2026-10-11T00:00:00Z');
  const bar = (trends: Array<{ date: string; hoursWorked: number; tasksCompleted: number }>, date: string) =>
    trends.find((t) => t.date === date)!;

  it('a 00:30 Vienna clock-in counts on that Vienna day', () => {
    const trends = service.buildDailyTrends(
      [],
      [{ totalMinutes: 120, clockInAt: new Date('2026-10-09T22:30:00Z'), location: { timezone: 'Europe/Vienna' } }],
      start, end, 'UTC',
    );
    expect(bar(trends, '2026-10-10').hoursWorked).toBe(2);
    expect(bar(trends, '2026-10-09').hoursWorked).toBe(0);
  });

  it('a job finished at 00:15 local counts on that local day; the org zone fills in for a workspace without one', () => {
    const trends = service.buildDailyTrends(
      [{ status: 'COMPLETED', createdAt: start, updatedAt: new Date('2026-10-09T22:15:00Z'), space: null }],
      [],
      start, end, 'Europe/Vienna',
    );
    expect(bar(trends, '2026-10-10').tasksCompleted).toBe(1);
  });
});
