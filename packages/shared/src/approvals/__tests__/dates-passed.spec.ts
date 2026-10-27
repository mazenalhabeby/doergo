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
