import { dayRequestEffect, nightRequestDay, type DayRequestRow } from '../core/approved-requests';

/**
 * Changed hours for a NIGHT (22:00–06:00 on the 24th) belong to the day the night starts. A
 * clock-in at 00:30 on the 25th read only the 25th's requests and found none — the night it was
 * part of never moved its plan.
 */
const TZ = 'Europe/Vienna';
const night: DayRequestRow = {
  id: 'n',
  kind: 'HOURS',
  spaceId: 'sp1',
  startTime: '22:00',
  endTime: '06:00',
  minutes: null,
  startDate: new Date('2026-10-24T00:00:00Z'),
  endDate: new Date('2026-10-24T00:00:00Z'),
};
const effectAt = (iso: string, rows: DayRequestRow[] = [night]) =>
  dayRequestEffect(rows, { spaceId: 'sp1', at: new Date(iso), tz: TZ, expectedClockInAt: null, expectedClockOutAt: null });

describe('a clock-in after midnight inside last night’s changed hours', () => {
  it('00:30 on the 25th takes the night of the 24th', () => {
    const e = effectAt('2026-10-24T22:30:00Z');
    expect(e.expectedClockInAt).toEqual(new Date('2026-10-24T20:00:00Z')); // 22:00 Vienna
    expect(e.expectedClockOutAt).toEqual(new Date('2026-10-25T05:00:00Z')); // 06:00 Vienna
    expect(e.requestIds).toEqual(['n']);
    expect(nightRequestDay([night], new Date('2026-10-24T22:30:00Z'), TZ, 'sp1')).toBe('2026-10-24');
  });

  it('07:00 on the 25th is past the night: its own day, nothing applies', () => {
    expect(effectAt('2026-10-25T06:00:00Z').requestIds).toEqual([]);
  });

  it('a day request (08:00–16:00) never reaches into the next morning', () => {
    expect(effectAt('2026-10-24T23:30:00Z', [{ ...night, startTime: '08:00', endTime: '16:00' }]).requestIds).toEqual([]);
  });

  it('another workspace’s night does not apply here', () => {
    expect(nightRequestDay([{ ...night, spaceId: 'sp2' }], new Date('2026-10-24T22:30:00Z'), TZ, 'sp1')).toBeNull();
  });
});
