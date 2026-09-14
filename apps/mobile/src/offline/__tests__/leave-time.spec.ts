import { hhmmIn, leaveTimeFrom, minutesPastEnd } from '../attendance/leave-time';

const TZ = 'Europe/Vienna';
const clockIn = new Date('2026-09-14T06:00:00Z'); // 08:00 in Vienna
const now = new Date('2026-09-15T05:45:00Z');

describe('when did you leave?', () => {
  it('reads the time on the day of the clock-in, in the shift’s zone', () => {
    expect(leaveTimeFrom('18:35', clockIn, TZ, now)).toEqual(new Date('2026-09-14T16:35:00Z'));
  });
  it('a time at or before the clock-in means the next day (a night shift)', () => {
    expect(leaveTimeFrom('02:00', new Date('2026-09-14T20:00:00Z'), TZ, now)).toEqual(new Date('2026-09-15T00:00:00Z'));
  });
  it('refuses a time that has not happened yet', () => {
    expect(leaveTimeFrom('09:00', new Date('2026-09-15T05:00:00Z'), TZ, new Date('2026-09-15T05:30:00Z'))).toBeNull();
    expect(leaveTimeFrom('nonsense', clockIn, TZ, now)).toBeNull();
  });
  it('seeds the picker with the time in the shift’s zone', () => {
    expect(hhmmIn(new Date('2026-09-14T15:00:00Z'), TZ)).toBe('17:00');
  });
  it('counts minutes past the end only beyond the grace', () => {
    const end = new Date('2026-09-14T15:00:00Z');
    expect(minutesPastEnd(end, new Date('2026-09-14T15:04:00Z'))).toBe(0);
    expect(minutesPastEnd(end, new Date('2026-09-14T16:40:00Z'))).toBe(100);
    expect(minutesPastEnd(null, now)).toBe(0);
  });
});
