import { mayAskForMoreTime, moreTimeRefusal } from '../more-time-rule';

describe('more time (clock review A8, B2)', () => {
  const now = Date.parse('2026-10-25T16:00:00Z');
  const end = '2026-10-25T15:30:00Z';

  it('no planned end, or only the daily-hours marker → refused, never offered', () => {
    expect(moreTimeRefusal({ expectedClockOutAt: null })).toBe('EXTRA_TIME_NO_SHIFT');
    expect(moreTimeRefusal({ expectedClockOutAt: end, endIsDailyLimit: true })).toBe('EXTRA_TIME_NO_SHIFT');
    expect(mayAskForMoreTime({ expectedClockOutAt: end, endIsDailyLimit: true }, { hasOption: true, now })).toBe(false);
  });

  it('a real shift past its end, the Option bought, not asked yet → offered', () => {
    expect(moreTimeRefusal({ expectedClockOutAt: end })).toBeNull();
    expect(mayAskForMoreTime({ expectedClockOutAt: end, reminderState: 'NONE' }, { hasOption: true, now })).toBe(true);
  });

  it('without the Option, before the end, or already asked → not offered', () => {
    expect(mayAskForMoreTime({ expectedClockOutAt: end }, { hasOption: false, now })).toBe(false);
    expect(mayAskForMoreTime({ expectedClockOutAt: '2026-10-25T17:00:00Z' }, { hasOption: true, now })).toBe(false);
    expect(
      mayAskForMoreTime({ expectedClockOutAt: end, reminderState: 'OVERTIME_PENDING' }, { hasOption: true, now }),
    ).toBe(false);
  });
});
