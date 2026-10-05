import { minutesByBasis, effectiveHoursBasis, countedMinutesOf } from '@hbcfield/shared/client';

/**
 * Which hours of a day go on a client's invoice (billing/hours-basis.ts).
 * Patrick: shift 07:00–15:30 with a 30-minute rest; clocked 06:48–16:05.
 */
describe('hours basis', () => {
  const at = (hm: string) => new Date(`2026-09-14T${hm}:00Z`);
  const day = {
    clockInAt: at('06:48'), clockOutAt: at('16:05'),
    expectedClockInAt: at('07:00'), expectedClockOutAt: at('15:30'),
    unpaidBreakMinutes: 30, paidMinutes: 480, // counted: 07:00–15:30 less 30
  };

  it('counted is the timesheet figure', () => {
    expect(minutesByBasis(day, 'COUNTED')).toEqual({ minutes: 480, fellBack: false });
  });
  it('clocked counts the early start and the late finish, less the rest', () => {
    expect(minutesByBasis(day, 'CLOCKED')).toEqual({ minutes: 527, fellBack: false }); // 8h47
  });
  it('shift is the planned shift, less the rest', () => {
    expect(minutesByBasis(day, 'SHIFT')).toEqual({ minutes: 480, fellBack: false });
  });
  it('a day with no planned shift falls back to counted, and says so', () => {
    const noShift = { ...day, expectedClockInAt: null, expectedClockOutAt: null };
    expect(minutesByBasis(noShift, 'SHIFT')).toEqual({ minutes: 480, fellBack: true });
  });
  it('a clock-in still running bills its counted time, never the rest of a planned shift', () => {
    const open = { ...day, clockOutAt: null, paidMinutes: null, totalMinutes: null };
    expect(minutesByBasis(open, 'SHIFT')).toEqual({ minutes: 0, fellBack: false });
    expect(minutesByBasis(open, 'CLOCKED')).toEqual({ minutes: 0, fellBack: false });
  });
  it('counted falls back to the clock span when nothing was computed', () => {
    expect(countedMinutesOf({ clockInAt: at('08:00'), clockOutAt: at('16:00') })).toBe(480);
  });
  it('nothing chosen, or anything unknown, is counted', () => {
    expect(effectiveHoursBasis(null)).toBe('COUNTED');
    expect(effectiveHoursBasis('NONSENSE')).toBe('COUNTED');
    expect(effectiveHoursBasis('SHIFT')).toBe('SHIFT');
  });
});

import { formatHoursMinutes, toMinute } from '@hbcfield/shared/client';
describe('hours as people read them', () => {
  it('shows hours and minutes, never a decimal', () => {
    expect(formatHoursMinutes(6839 / 60)).toBe('113 h 59 min');
    expect(formatHoursMinutes(8)).toBe('8 h');
    expect(formatHoursMinutes(0.75)).toBe('45 min');
    expect(formatHoursMinutes(0)).toBe('0 min');
  });
  it('holds hours to the whole minute', () => {
    expect(toMinute(113.9833333) * 60).toBeCloseTo(6839);
  });
});
