/**
 * The clock-out sheet asks about overtime when the member is PAST THE ROSTERED
 * END — not only when the day's total beats the target. A late arrival who
 * stays past the end was told "short" and never asked (2026-09-26 audit).
 */
import { readClockOut } from '../../components/home/clock-out-state';

const end = new Date('2026-09-27T05:16:00.000Z');
const base = { restMinutes: 0, targetMinutes: 600, shiftEndAt: end };

describe('readClockOut — the rostered end decides overtime', () => {
  it('late in, 44 min past the end, 513 of 600 counted → late (overtime), 44 over, not short', () => {
    const v = readClockOut({ ...base, countedMinutes: 513, now: new Date(end.getTime() + 44 * 60_000) } as never);
    expect(v.face).toBe('late');
    expect(v.overBy).toBe(44);
    expect(v.shortBy).toBe(0);
  });

  it('leaving before the end with a short day → early', () => {
    const v = readClockOut({ ...base, countedMinutes: 480, now: new Date(end.getTime() - 120 * 60_000) } as never);
    expect(v.face).toBe('early');
    expect(v.shortBy).toBe(120);
  });

  it('within a minute of the end → on time', () => {
    const v = readClockOut({ ...base, countedMinutes: 600, now: new Date(end.getTime() + 30_000) } as never);
    expect(v.face).toBe('onTime');
  });

  it('no rostered end → nothing to be late against (the server has no end to flag either)', () => {
    const v = readClockOut({ ...base, shiftEndAt: null, countedMinutes: 650, now: end } as never);
    expect(v.face).toBe('onTime');
    expect(v.overBy).toBe(0);
  });
});
