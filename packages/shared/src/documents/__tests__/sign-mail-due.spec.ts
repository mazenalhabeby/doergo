import { signMailDue, SIGN_LINK_REMINDER_DAYS } from '../sign-link';

/** A client is emailed once per turn, reminded at 3 and 7 days, and then left alone. */
describe('signMailDue', () => {
  const mailed = new Date('2026-10-01T09:00:00Z');
  const at = (days: number) => new Date(mailed.getTime() + days * 24 * 60 * 60 * 1000);

  it('owes the first email when nothing was sent for this turn', () => {
    expect(signMailDue({ linkMailedAt: null, linkReminders: 0 }, at(0))).toBe('FIRST');
  });

  it('owes nothing in the days after the first email', () => {
    expect(signMailDue({ linkMailedAt: mailed, linkReminders: 0 }, at(0))).toBeNull();
    expect(signMailDue({ linkMailedAt: mailed, linkReminders: 0 }, at(2.9))).toBeNull();
  });

  it('owes one reminder after 3 days and one after 7, then stops', () => {
    expect(SIGN_LINK_REMINDER_DAYS).toEqual([3, 7]);
    expect(signMailDue({ linkMailedAt: mailed, linkReminders: 0 }, at(3))).toBe('REMINDER');
    expect(signMailDue({ linkMailedAt: mailed, linkReminders: 1 }, at(6))).toBeNull();
    expect(signMailDue({ linkMailedAt: mailed, linkReminders: 1 }, at(7))).toBe('REMINDER');
    expect(signMailDue({ linkMailedAt: mailed, linkReminders: 2 }, at(30))).toBeNull();
  });
});
