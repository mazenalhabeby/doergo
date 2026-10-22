/*
  The Clients widget's pure rules under the conditions a real day produces:
  the nights the clocks change, a row ticked off while the next refresh lands,
  and an answer whose counts disagree with its rows.
*/
process.env.TZ = 'Europe/Vienna';

import { daysLate, headline, localDay, withoutDone, rowLines } from '../../features/home/clients-state';
import type { ClientsDue, DueReminder } from '../api/customers';

const r = (over: Partial<DueReminder>): DueReminder => ({
  id: 'a', customerId: 'c', name: 'BILLA AG', type: 'COMPANY', kind: 'CALL', note: null, dueAt: null,
  shared: 0, phone: null, email: null, ...over,
});
const answer = (items: DueReminder[], counts: Partial<ClientsDue['counts']>, total?: number): ClientsDue => {
  const c = { call: 0, email: 0, other: 0, overdue: 0, ...counts };
  return {
    allowed: true, items, total: total ?? c.call + c.email + c.other, counts: c,
    cold: { count: 0, days: 30, longest: null }, book: 5,
  };
};

describe('Clients widget — the member’s day', () => {
  it('the test really runs in Vienna (DST applies)', () => {
    expect(new Date('2026-07-01T12:00:00Z').getTimezoneOffset()).toBe(-120);
    expect(new Date('2026-12-01T12:00:00Z').getTimezoneOffset()).toBe(-60);
  });

  it('localDay is the local midnight to local end of day, 23h or 25h on a DST night', () => {
    const spring = localDay(new Date('2026-03-29T12:00:00'));
    expect(spring.end.getTime() - spring.start.getTime() + 1).toBe(23 * 3_600_000);
    const autumn = localDay(new Date('2026-10-25T12:00:00'));
    expect(autumn.end.getTime() - autumn.start.getTime() + 1).toBe(25 * 3_600_000);
  });

  it('BUG FIXED: yesterday 00:00 is ONE day late on the morning after the clocks go back', () => {
    const today = new Date('2026-10-26T00:00:00'); // the 25th was 25 hours long
    expect(daysLate(new Date('2026-10-25T00:00:00').toISOString(), today)).toBe(1);
    expect(daysLate(new Date('2026-10-25T23:30:00').toISOString(), today)).toBe(1);
    expect(daysLate(new Date('2026-10-24T09:00:00').toISOString(), today)).toBe(2);
  });

  it('after the clocks go forward: yesterday is still 1, the day before 2', () => {
    const today = new Date('2026-03-30T00:00:00'); // the 29th was 23 hours long
    expect(daysLate(new Date('2026-03-29T00:00:00').toISOString(), today)).toBe(1);
    expect(daysLate(new Date('2026-03-28T23:59:00').toISOString(), today)).toBe(2);
  });

  it('today, a missing date, or garbage is never "late"', () => {
    const today = new Date('2026-09-26T00:00:00');
    expect(daysLate(new Date('2026-09-26T00:00:00').toISOString(), today)).toBeNull();
    expect(daysLate(null, today)).toBeNull();
    expect(daysLate('not a date', today)).toBeNull();
  });

  it('a week late is 7, whatever the hour', () => {
    const today = new Date('2026-09-26T00:00:00');
    expect(daysLate(new Date('2026-09-19T23:59:00').toISOString(), today)).toBe(7);
    expect(daysLate(new Date('2026-09-19T00:00:00').toISOString(), today)).toBe(7);
  });
});

describe('Clients widget — ticked rows', () => {
  const today = new Date('2026-09-26T00:00:00');
  const late = r({ id: 'l', dueAt: new Date('2026-09-24T10:00:00').toISOString() });
  const now = r({ id: 'n', kind: 'EMAIL', dueAt: new Date('2026-09-26T15:00:00').toISOString() });

  it('ticking a late call takes it off the call count AND the overdue count', () => {
    const d = withoutDone(answer([late, now], { call: 1, email: 1, overdue: 1 }), [late], today);
    expect(d.total).toBe(1);
    expect(d.counts).toEqual({ call: 0, email: 1, other: 0, overdue: 0 });
  });

  it('a row the server no longer returns is not subtracted twice', () => {
    const d = withoutDone(answer([now], { email: 1 }), [late], today);
    expect(d.total).toBe(1);
    expect(d.counts.email).toBe(1);
  });

  it('never goes below zero, even when the answer’s counts are short', () => {
    const d = withoutDone(answer([late, now], { call: 0, email: 0 }, 0), [late, now], today);
    expect(d.total).toBe(0);
    expect(Object.values(d.counts).every((n) => n >= 0)).toBe(true);
    expect(headline(d)).toBeNull();
  });

  it('once every row is ticked the headline is gone ("nobody is waiting")', () => {
    const d = withoutDone(answer([late, now], { call: 1, email: 1, overdue: 1 }), [late, now], today);
    expect(headline(d)).toBeNull();
  });
});

describe('Clients widget — words come from data', () => {
  it('the headline count is the answer’s total, not the rows on screen', () => {
    const h = headline(answer([r({})], { call: 9, overdue: 4 }))!;
    expect(h.title.values).toEqual({ count: 9 });
    expect(h.split).toEqual([
      { key: 'clientsCard.split.overdue', values: { count: 4 } },
      { key: 'clientsCard.split.todayCount', values: { count: 5 } },
    ]);
  });

  it('every one late: says only how many are late', () => {
    expect(headline(answer([], { email: 3, overdue: 3 }))!.split).toEqual([{ key: 'clientsCard.split.overdue', values: { count: 3 } }]);
  });

  it('one kind, one reminder: "today"', () => {
    expect(headline(answer([], { call: 1 }))!.split).toEqual([{ key: 'clientsCard.split.today' }]);
  });

  it('a shared row names how many managers share it', () => {
    expect(rowLines(r({ shared: 3, note: 'x' })).reason).toEqual({ key: 'clientsCard.row.ringShared', values: { count: 3 } });
    expect(rowLines(r({ kind: 'EMAIL', shared: 2 })).reason).toEqual({ key: 'clientsCard.row.emailShared', values: { count: 2 } });
  });

  it('OTHER with no note falls back to the client, never an empty title', () => {
    expect(rowLines(r({ kind: 'OTHER', note: null })).title).toEqual({ key: 'clientsCard.row.other', values: { name: 'BILLA AG' } });
  });
});
