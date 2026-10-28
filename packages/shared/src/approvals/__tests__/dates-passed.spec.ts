import { datesPassed } from '../approval-items-time';

/* Leave for days already over still waits in some inboxes (asked late, never answered): the row says so. */
describe('datesPassed', () => {
  const now = new Date('2026-10-28T09:00:00Z');
  it('the last day before today → passed', () => expect(datesPassed('2026-10-27', now)).toBe(true));
  it('ending today or later → not passed', () => {
    expect(datesPassed('2026-10-28', now)).toBe(false);
    expect(datesPassed(new Date('2026-11-02T00:00:00Z'), now)).toBe(false);
  });
  it('no date → not passed', () => expect(datesPassed(null, now)).toBe(false));
});

describe('datesPassed in the organization’s day (round 10)', () => {
  it('HBC USA: the evening of the last day is still the last day, not "passed"', () => {
    const evening = new Date('2026-10-29T02:00:00Z'); // 19:00 on Oct 28 in Los Angeles, Oct 29 in UTC
    expect(datesPassed('2026-10-28', evening, 'America/Los_Angeles')).toBe(false);
    expect(datesPassed('2026-10-28', evening)).toBe(true); // UTC would say passed — the bug it fixes
  });
  it('Vienna: just after midnight the day before has passed', () => {
    expect(datesPassed('2026-10-28', new Date('2026-10-28T23:30:00Z'), 'Europe/Vienna')).toBe(true);
  });
});
