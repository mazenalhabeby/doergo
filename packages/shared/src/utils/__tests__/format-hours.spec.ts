import { formatHours } from '@hbcfield/shared';

/** "0.5h" on a timesheet reads as a typo — hours are shown as hours and minutes. */
describe('formatHours', () => {
  it.each([
    [0.5, '30m'],
    [1.5, '1h 30m'],
    [11, '11h'],
    [10.35, '10h 21m'],
    [229.7, '229h 42m'],
    [0, '0m'],
    [-0.25, '-15m'],
  ])('%p → %p', (hours, text) => expect(formatHours(hours)).toBe(text));

  it('shows a dash when there is no number', () => {
    expect(formatHours(null)).toBe('-');
    expect(formatHours(Number.NaN)).toBe('-');
  });
});
