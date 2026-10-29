import { firstRunAt, nextRunAfter, nextRunPast, withinEnd } from '../recurring-schedule';

/*
  Every run is a day and a time WHERE THE WORK IS. The old rule added a period to
  "now" on the server's (UTC) calendar: runs drifted to whenever the poller ticked,
  the start day never made a job, and a New York "Monday" was Monday in London.
*/
const VIENNA = 'Europe/Vienna';
const NEW_YORK = 'America/New_York';
const iso = (d: Date) => d.toISOString();

describe('the first run', () => {
  it('is the start day itself', () => {
    const start = new Date('2026-11-02T08:00:00Z'); // 09:00 in Vienna
    expect(iso(firstRunAt({ frequency: 'DAILY' }, start, VIENNA))).toBe('2026-11-02T08:00:00.000Z');
    expect(iso(firstRunAt({ frequency: 'CUSTOM', customDays: 3 }, start, VIENNA))).toBe('2026-11-02T08:00:00.000Z');
  });

  it('or the first day after it that the rule names', () => {
    const monday = new Date('2026-11-02T08:00:00Z');
    expect(iso(firstRunAt({ frequency: 'WEEKLY', dayOfWeek: 1 }, monday, VIENNA))).toBe('2026-11-02T08:00:00.000Z');
    expect(iso(firstRunAt({ frequency: 'WEEKLY', dayOfWeek: 3 }, monday, VIENNA))).toBe('2026-11-04T08:00:00.000Z');
    expect(iso(firstRunAt({ frequency: 'MONTHLY', dayOfMonth: 5 }, monday, VIENNA))).toBe('2026-11-05T08:00:00.000Z');
    expect(iso(firstRunAt({ frequency: 'MONTHLY', dayOfMonth: 1 }, monday, VIENNA))).toBe('2026-12-01T08:00:00.000Z');
  });
});

describe('the next run is the PLANNED one plus a period, in the workspace zone', () => {
  it('keeps its wall-clock time across a clock change', () => {
    // 09:00 summer time in Vienna, then the clocks go back on 25 October.
    const planned = new Date('2026-10-24T07:00:00Z');
    expect(iso(nextRunAfter({ frequency: 'DAILY' }, planned, VIENNA))).toBe('2026-10-25T08:00:00.000Z');
  });

  it('a weekday is the workspace’s weekday, not UTC’s', () => {
    // Monday 20:00 in New York is already Tuesday in UTC.
    const planned = new Date('2026-11-03T01:00:00Z');
    const next = nextRunAfter({ frequency: 'WEEKLY', dayOfWeek: 1 }, planned, NEW_YORK);
    expect(iso(next)).toBe('2026-11-10T01:00:00.000Z'); // the next Monday 20:00 there
    expect(iso(nextRunAfter({ frequency: 'BIWEEKLY', dayOfWeek: 1 }, planned, NEW_YORK))).toBe('2026-11-17T01:00:00.000Z');
  });

  it('a monthly day past the month’s end lands on its last day, and comes back', () => {
    const rule = { frequency: 'MONTHLY', dayOfMonth: 31 };
    const jan = new Date('2027-01-31T08:00:00Z');
    const feb = nextRunAfter(rule, jan, VIENNA);
    expect(iso(feb)).toBe('2027-02-28T08:00:00.000Z');
    expect(iso(nextRunAfter(rule, feb, VIENNA))).toBe('2027-03-31T07:00:00.000Z'); // summer time by then
  });

  it('runs missed while down make one: the first planned run after now, still on the planned time', () => {
    const planned = new Date('2026-11-02T08:00:00Z');
    const now = new Date('2026-11-05T10:31:00Z');
    expect(iso(nextRunPast({ frequency: 'DAILY' }, planned, now, VIENNA))).toBe('2026-11-06T08:00:00.000Z');
  });

  it('nothing past the end', () => {
    expect(withinEnd(new Date('2026-12-02'), new Date('2026-12-01'))).toBeNull();
    expect(withinEnd(new Date('2026-11-30'), new Date('2026-12-01'))).toEqual(new Date('2026-11-30'));
  });
});
