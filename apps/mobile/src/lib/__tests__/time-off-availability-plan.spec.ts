/**
 * Time off: what is asked of the server when a range is picked.
 *
 * It used to be one GET per day, in sequence, up to fourteen per pick, and the
 * cache the screen kept was never read before asking again.
 */
import {
  AVAILABILITY_MAX_DAYS, mapLimited, mergeAvailability, planAvailabilityFetch, rangeUnsupported,
} from '../../features/time-off/availability-plan';
import {
  availabilityInsights, datesWithStatus, filterRequests, getDayCount, getMonthGrid, isDateInRange, timeOffStats, toDateString,
} from '../../features/time-off/helpers';
import type { AvailabilityResponse, TimeOffRequest } from '../api/types';

const day = (date: string, available = 3, total = 5, off: { id: string; name: string }[] = []): AvailabilityResponse => ({
  date,
  dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
  dayName: 'x',
  technicians: off.map((o) => ({ id: o.id, firstName: o.name, lastName: 'L', onTimeOff: true }) as never),
  summary: { total, available, onTimeOff: off.length, notScheduled: 0 },
});
const d = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y!, m! - 1, dd!); };

describe('planAvailabilityFetch', () => {
  it('a fourteen-day pick with nothing known is ONE request for the whole span', () => {
    const plan = planAvailabilityFetch(d('2026-10-12'), d('2026-10-25'), {});
    expect(plan.days).toHaveLength(14);
    expect(plan.missing).toHaveLength(14);
    expect(plan.fetch).toEqual({ from: '2026-10-12', to: '2026-10-25' });
  });

  it('never reads past fourteen days, however long the range', () => {
    const plan = planAvailabilityFetch(d('2026-10-01'), d('2026-11-30'), {});
    expect(plan.days).toHaveLength(AVAILABILITY_MAX_DAYS);
    expect(plan.fetch).toEqual({ from: '2026-10-01', to: '2026-10-14' });
  });

  it('asks nothing when every day is already held', () => {
    const cache = { '2026-10-12': day('2026-10-12'), '2026-10-13': day('2026-10-13') };
    const plan = planAvailabilityFetch(d('2026-10-12'), d('2026-10-13'), cache);
    expect(plan.missing).toEqual([]);
    expect(plan.fetch).toBeNull();
  });

  it('asks only from the first missing day to the last', () => {
    const cache = { '2026-10-12': day('2026-10-12'), '2026-10-13': day('2026-10-13'), '2026-10-16': day('2026-10-16') };
    const plan = planAvailabilityFetch(d('2026-10-12'), d('2026-10-17'), cache);
    expect(plan.missing).toEqual(['2026-10-14', '2026-10-15', '2026-10-17']);
    expect(plan.fetch).toEqual({ from: '2026-10-14', to: '2026-10-17' });
  });

  it('a single day is a one-day span', () => {
    expect(planAvailabilityFetch(d('2026-10-12'), d('2026-10-12'), {}).fetch).toEqual({ from: '2026-10-12', to: '2026-10-12' });
  });

  it('crosses a month end in the phone\'s own calendar', () => {
    expect(planAvailabilityFetch(d('2026-10-30'), d('2026-11-02'), {}).days).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('mergeAvailability', () => {
  it('files each answer under its own date, whatever order it came in', () => {
    const merged = mergeAvailability({ '2026-10-12': day('2026-10-12', 1) }, [day('2026-10-14', 4), day('2026-10-13', 2)]);
    expect(Object.keys(merged).sort()).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(merged['2026-10-13']!.summary.available).toBe(2);
    expect(merged['2026-10-12']!.summary.available).toBe(1);
  });

  it('an empty or missing answer leaves the cache as it was', () => {
    const cache = { '2026-10-12': day('2026-10-12') };
    expect(mergeAvailability(cache, [])).toBe(cache);
    expect(mergeAvailability(cache, null)).toBe(cache);
  });
});

describe('the fallback for an older server', () => {
  it('only 400 and 404 mean "no range form here"', () => {
    expect(rangeUnsupported({ statusCode: 404 })).toBe(true);
    expect(rangeUnsupported({ statusCode: 400 })).toBe(true);
    expect(rangeUnsupported({ statusCode: 0 })).toBe(false);
    expect(rangeUnsupported({ statusCode: 500 })).toBe(false);
    expect(rangeUnsupported(new Error('x'))).toBe(false);
  });

  it('runs at most two at once and keeps the order', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimited([1, 2, 3, 4, 5], 2, async (n) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 - n));
      running--;
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });
});

describe('the screen\'s rules, moved out unchanged', () => {
  it('counts days inclusively', () => {
    expect(getDayCount('2026-10-12', '2026-10-12')).toBe(1);
    expect(getDayCount('2026-10-12', '2026-10-16')).toBe(5);
  });

  it('the month grid starts on Monday', () => {
    const grid = getMonthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(grid[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(grid[0]![3]!.getDate()).toBe(1);
  });

  it('a range includes both ends', () => {
    expect(isDateInRange(d('2026-10-12'), d('2026-10-12'), d('2026-10-14'))).toBe(true);
    expect(isDateInRange(d('2026-10-15'), d('2026-10-12'), d('2026-10-14'))).toBe(false);
  });

  it('dots, stats and the Upcoming filter', () => {
    const r = (id: string, startDate: string, endDate: string, status: TimeOffRequest['status']) =>
      ({ id, startDate, endDate, status }) as TimeOffRequest;
    const reqs = [r('a', '2026-10-01', '2026-10-02', 'APPROVED'), r('b', '2026-10-20', '2026-10-21', 'APPROVED'), r('c', '2026-10-22', '2026-10-22', 'PENDING')];
    expect(Object.keys(datesWithStatus(reqs, 'PENDING'))).toEqual(['2026-10-22']);
    expect(timeOffStats(reqs, d('2026-10-10'))).toEqual({ daysUsed: 2, upcoming: 2, pending: 1, rejected: 0 });
    expect(filterRequests(reqs, 'upcoming', d('2026-10-10')).map((x) => x.id)).toEqual(['b', 'c']);
    expect(toDateString(d('2026-01-05'))).toBe('2026-01-05');
  });

  it('insights read the worst day and who else is out, never the member', () => {
    const cache = {
      '2026-10-12': day('2026-10-12', 3, 5, [{ id: 'k', name: 'Karim' }]),
      '2026-10-13': day('2026-10-13', 1, 5, [{ id: 'me', name: 'Me' }]),
    };
    const ins = availabilityInsights(d('2026-10-12'), d('2026-10-14'), cache, {}, 0, 'me')!;
    expect(ins.worstDay).toBe('2026-10-13');
    expect(ins.lowCoverage).toBe(true);
    expect(ins.teamOnTimeOff).toEqual(['Karim L']);
    expect(availabilityInsights(d('2026-10-12'), d('2026-10-12'), {}, {}, 0, 'me')).toBeNull();
  });
});

describe('a ranged answer that comes back short', () => {
  it('names the days it left out (the DST change drops the last one) so they are asked singly', () => {
    const { daysNotAnswered } = require('../../features/time-off/availability-plan');
    const asked = ['2026-10-24', '2026-10-25', '2026-10-26'];
    expect(daysNotAnswered(asked, [{ date: '2026-10-24' }, { date: '2026-10-25' }])).toEqual(['2026-10-26']);
    expect(daysNotAnswered(asked, asked.map((date) => ({ date })))).toEqual([]);
  });
});
