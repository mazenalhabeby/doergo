/**
 * The Time tab's rules — where you work, the week's shifts, and time off.
 */
import type { CompanyLocation } from '@hbcfield/shared/client';
import {
  placesView, workWeekdays, daysOff, leaveDays, overlapIn, usedThisYear, upcomingLeave, monthGrid, dayKey, dayOf, statusOf,
} from '@/features/time/time-logic';

const site = (id: string, lat: number | null, lng: number | null, extra: Partial<CompanyLocation> = {}) =>
  ({ id, name: id, lat, lng, geofenceRadius: 50, ...extra }) as unknown as CompanyLocation;

describe('where you work', () => {
  const office = site('Office', 47.9813, 13.8269);
  const store = site('Store', 47.9186, 13.7991);
  const floating = site('Floating', null, null);
  const remote = site('Remote', null, null, { isRemote: true });
  const atOffice = { lat: 47.9813, lng: 13.8270, accuracy: 10 };

  it('the place you stand in comes first and reads "here"; the rest by distance; no-site last', () => {
    const v = placesView([floating, store, office, remote], atOffice, null);
    expect(v.map((x) => [x.location.id, x.relation])).toEqual([['Office', 'here'], ['Store', 'away'], ['Floating', 'anywhere']]);
    expect(v[1].metres).toBeGreaterThan(5000);
  });

  it('the place you are clocked in at beats the one you stand in', () => {
    const v = placesView([office, store], atOffice, 'Store');
    expect(v[0].location.id).toBe('Store');
    expect(v[0].relation).toBe('clockedIn');
  });

  it('never lists the Remote bucket — it is a mode, not a place', () => {
    expect(placesView([remote], atOffice, null)).toEqual([]);
  });

  it('with no position it says so, and never claims "here"', () => {
    const v = placesView([office, floating], null, null);
    expect(v.map((x) => x.relation)).toEqual(['unknown', 'anywhere']);
  });

  it('"here" is the drawn outline when there is one, not the radius', () => {
    const drawn = site('Drawn', 47.9813, 13.8269, {
      geofenceRadius: 5000,
      geofencePolygon: [{ lat: 47.98, lng: 13.82 }, { lat: 47.98, lng: 13.83 }, { lat: 47.982, lng: 13.83 }, { lat: 47.982, lng: 13.82 }],
    });
    expect(placesView([drawn], { lat: 47.99, lng: 13.84, accuracy: 5 }, null)[0].relation).toBe('away');
  });
});

describe('time off', () => {
  const weekdays = workWeekdays([1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, isActive: true })));

  it('no rota is "unknown", not "works no days"', () => {
    expect(workWeekdays([])).toBeNull();
    expect(workWeekdays([{ dayOfWeek: 1, isActive: false }])).toBeNull();
  });

  it('counts rota days when the rota is known, calendar days when it is not', () => {
    const fri = new Date(2026, 9, 2);
    const mon = new Date(2026, 9, 5);
    expect(daysOff(fri, mon, weekdays)).toBe(2);
    expect(daysOff(fri, mon, null)).toBe(4);
  });

  it('marks approved and waiting days, approved winning where they overlap', () => {
    const m = leaveDays([
      { startDate: '2026-10-05', endDate: '2026-10-07', status: 'PENDING' },
      { startDate: '2026-10-07T00:00:00.000Z', endDate: '2026-10-08', status: 'APPROVED' },
      { startDate: '2026-10-12', endDate: '2026-10-12', status: 'REJECTED' },
    ]);
    expect(m.get('2026-10-05')).toBe('pending');
    expect(m.get('2026-10-07')).toBe('approved');
    expect(m.has('2026-10-12')).toBe(false);
    expect(overlapIn(new Date(2026, 9, 1), new Date(2026, 9, 4), m)).toBeNull();
    expect(dayKey(overlapIn(new Date(2026, 9, 1), new Date(2026, 9, 6), m)!)).toBe('2026-10-05');
  });

  it('"used this year" is approved leave that has started, clipped to this year and to today', () => {
    const now = new Date(2026, 8, 27);
    const used = usedThisYear([
      { startDate: '2025-12-29', endDate: '2026-01-02', status: 'APPROVED' }, // Thu 1 + Fri 2 Jan
      { startDate: '2026-09-24', endDate: '2026-09-30', status: 'APPROVED' }, // Thu 24, Fri 25 so far
      { startDate: '2026-10-19', endDate: '2026-10-23', status: 'APPROVED' }, // not yet
      { startDate: '2026-03-02', endDate: '2026-03-06', status: 'PENDING' },
    ], weekdays, now);
    expect(used).toBe(4);
  });

  it('upcoming: waiting or approved, not over yet, soonest first', () => {
    const now = new Date(2026, 8, 27);
    const list = upcomingLeave([
      { id: 'b', startDate: '2026-10-19', endDate: '2026-10-23', status: 'APPROVED' },
      { id: 'a', startDate: '2026-10-05', endDate: '2026-10-07', status: 'PENDING' },
      { id: 'past', startDate: '2026-09-01', endDate: '2026-09-02', status: 'APPROVED' },
      { id: 'no', startDate: '2026-11-01', endDate: '2026-11-02', status: 'REJECTED' },
      { id: 'now', startDate: '2026-09-25', endDate: '2026-09-28', status: 'APPROVED' },
    ], now);
    expect(list.map((r) => r.id)).toEqual(['now', 'a', 'b']);
  });

  it('a month is drawn Monday first, in whole weeks', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g.length % 7).toBe(0);
    expect(dayKey(g[0])).toBe('2026-09-28');
    expect(g[0].getDay()).toBe(1);
  });

  it('a date string is read as the LOCAL day it names', () => {
    expect(dayKey(dayOf('2026-10-05T00:00:00.000Z'))).toBe('2026-10-05');
  });
});

describe('a shift\'s status on the row', () => {
  it('"closed for you" beats the approval', () => {
    expect(statusOf({ status: 'AUTO_OUT', approvalStatus: 'APPROVED' } as never)).toBe('closedForYou');
    expect(statusOf({ status: 'CLOCKED_OUT', approvalStatus: 'AUTO' } as never)).toBe('approved');
    expect(statusOf({ status: 'CLOCKED_OUT', approvalStatus: 'PENDING' } as never)).toBe('waiting');
    expect(statusOf({ status: 'CLOCKED_OUT', approvalStatus: 'REJECTED' } as never)).toBe('rejected');
  });
});

import { minutesPastEnd, suggestedExtra, stepExtra, EXTRA_MAX } from '@/features/time/time-logic';

describe('extra time', () => {
  const end = '2026-09-27T12:30:00.000Z';
  it('past the end: up to now while working, up to the clock-out once left, zero with no end', () => {
    expect(minutesPastEnd({ expectedClockOutAt: end }, new Date('2026-09-27T14:10:00.000Z'))).toBe(100);
    expect(minutesPastEnd({ expectedClockOutAt: end, clockOutAt: '2026-09-27T13:50:00.000Z' }, new Date('2026-09-27T20:00:00.000Z'))).toBe(80);
    expect(minutesPastEnd({ expectedClockOutAt: end }, new Date('2026-09-27T12:00:00.000Z'))).toBe(0);
    expect(minutesPastEnd({ expectedClockOutAt: null }, new Date())).toBe(0);
  });
  it('the suggestion rounds UP to a quarter hour, at least 15, at most the cap', () => {
    expect(suggestedExtra(100)).toBe(105);
    expect(suggestedExtra(90)).toBe(90);
    expect(suggestedExtra(0)).toBe(15);
    expect(suggestedExtra(5000)).toBe(EXTRA_MAX);
  });
  it('steps stay inside the bounds', () => {
    expect(stepExtra(15, -1)).toBe(15);
    expect(stepExtra(EXTRA_MAX, 1)).toBe(EXTRA_MAX);
    expect(stepExtra(30, 1)).toBe(45);
  });
});
