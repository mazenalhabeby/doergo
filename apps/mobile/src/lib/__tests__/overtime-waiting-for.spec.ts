import { waitingText } from '../../features/time/time-logic';

/* The extra-time line names who it waits for — one line, not two. */
const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? ' ' + JSON.stringify(o) : ''}`;

describe('waiting for whom', () => {
  it('names the one person asked', () => {
    expect(waitingText({ askedOf: { names: ['Anna'], more: 0 } }, t)).toBe('overtime.waitingFor {"name":"Anna"}');
  });
  it('several administrators: the first, and how many others', () => {
    expect(waitingText({ askedOf: { names: ['Anna', 'John'], more: 2 } }, t)).toBe('overtime.waitingForOthers {"name":"Anna","count":3}');
  });
  it('an older server sends no names: the line it always said', () => {
    expect(waitingText({}, t)).toBe('overtime.waitingApproval');
    expect(waitingText({ askedOf: { names: [], more: 0 } }, t)).toBe('overtime.waitingApproval');
  });
});

import { overtimePlaceLine } from '../../features/time/time-logic';

describe('the line under the workspace on the extra-time page', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const entry = (o: object) => ({ clockInAt: '2026-10-14T07:48:00Z', clockOutAt: null, expectedClockOutAt: null, ...o });
  it('no planned shift: on the clock since — never "your shift has ended"', () => {
    expect(overtimePlaceLine({ status: 'PENDING_APPROVAL', timeEntry: entry({}) }, now)).toEqual({ key: 'onClockSince', at: '2026-10-14T07:48:00Z' });
  });
  it('a shift that ended / will end', () => {
    expect(overtimePlaceLine({ status: 'PENDING_APPROVAL', timeEntry: entry({ expectedClockOutAt: '2026-10-14T11:30:00Z' }) }, now)?.key).toBe('shiftEndedAt');
    expect(overtimePlaceLine({ status: 'PENDING_APPROVAL', timeEntry: entry({ expectedClockOutAt: '2026-10-14T15:00:00Z' }) }, now)?.key).toBe('shiftEndsAt');
  });
  it('clocked out already, and approved', () => {
    expect(overtimePlaceLine({ status: 'PENDING_APPROVAL', timeEntry: entry({ clockOutAt: '2026-10-14T11:50:00Z' }) }, now)?.key).toBe('clockedOutAt');
    expect(overtimePlaceLine({ status: 'APPROVED', overtimeEndAt: '2026-10-14T12:30:00Z', timeEntry: entry({}) }, now)).toEqual({ key: 'approvedUntil', at: '2026-10-14T12:30:00Z' });
  });
  it('an older server sends no shift: no line', () => {
    expect(overtimePlaceLine({ status: 'PENDING_APPROVAL' }, now)).toBeNull();
  });
});
