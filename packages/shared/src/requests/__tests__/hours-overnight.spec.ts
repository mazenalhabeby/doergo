/**
 * Changed hours across midnight (docs/plans/time-counting-model.md, phase 2): a night
 * 18:00–06:00 ends at 06:00 the NEXT morning, and belongs to the day it starts.
 */
import { applyApprovedRequests, parseRequestInput } from '../request-kinds';

const hours = (startTime?: string, endTime?: string) =>
  parseRequestInput({ kind: 'HOURS', startDate: '2026-10-24', startTime, endTime });

describe('the parser', () => {
  it('takes a day and a night', () => {
    expect(hours('08:00', '16:00').ok).toBe(true);
    expect(hours('18:00', '06:00').ok).toBe(true); // 12 h night
    expect(hours('14:00', '06:00').ok).toBe(true); // 16 h, the most a night may last
  });

  it('refuses the same time, and a "night" too long to be one', () => {
    expect(hours('08:00', '08:00')).toEqual({ ok: false, code: 'REQUEST_TIME_INVALID' });
    expect(hours('14:00', '09:00')).toEqual({ ok: false, code: 'REQUEST_TIME_INVALID' }); // 19 h — a slip
    expect(hours('16:00', '10:00')).toEqual({ ok: false, code: 'REQUEST_TIME_INVALID' });
  });
});

describe('the day rule', () => {
  // Wall time on 2026-10-24 (or the day after) read as UTC, to keep the arithmetic visible.
  const atLocal = (hm: string, nextDay?: boolean) => new Date(`2026-10-2${nextDay ? 5 : 4}T${hm}:00.000Z`);
  const apply = (startTime: string | null, endTime: string | null, shift?: [string, string]) =>
    applyApprovedRequests({
      spaceId: 's',
      expectedClockInAt: shift ? new Date(shift[0]) : null,
      expectedClockOutAt: shift ? new Date(shift[1]) : null,
      requests: [{ id: 'r', kind: 'HOURS', spaceId: 's', startTime, endTime }],
      atLocal,
    });

  it('a night ends the next morning', () => {
    const e = apply('18:00', '06:00');
    expect(e.expectedClockInAt).toEqual(new Date('2026-10-24T18:00:00Z'));
    expect(e.expectedClockOutAt).toEqual(new Date('2026-10-25T06:00:00Z'));
  });

  it('a new end alone on a night shift is the next morning too', () => {
    const e = apply(null, '07:00', ['2026-10-24T18:00:00Z', '2026-10-25T06:00:00Z']);
    expect(e.expectedClockOutAt).toEqual(new Date('2026-10-25T07:00:00Z'));
  });

  it('a day stays on its day', () => {
    const e = apply('08:00', '18:00');
    expect(e.expectedClockOutAt).toEqual(new Date('2026-10-24T18:00:00Z'));
  });
});
