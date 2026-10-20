import {
  approvalRoute,
  noShowAttendancePrefill,
  noShowDayMark,
  noShowRuns,
  settleNoShow,
  type NoShowFacts,
} from '@hbcfield/shared';

/*
  A no-show used to end one way — "Excuse" — and everything else sat
  "Escalated" for ever. These pin how it ends now (shared attendance/no-show.ts).
*/

const none: NoShowFacts = { overlapping: [], onLeave: false, memberGone: false, stillPlanned: true, holiday: false };
const inst = { spaceId: 'office' };

describe('what the system closes by itself', () => {
  it('a real miss is left for a leader', () => {
    expect(settleNoShow(inst, none)).toBeNull();
  });

  it('a clock-in HERE is presence (late, or hours added after) — never an excuse', () => {
    expect(settleNoShow(inst, { ...none, onLeave: true, overlapping: [{ timeEntryId: 'e1', spaceId: 'office' }] }))
      .toEqual({ state: 'PRESENT', timeEntryId: 'e1' });
  });

  it('a clock-in at another workspace in the shift time closes it as ELSEWHERE, naming where', () => {
    expect(settleNoShow(inst, { ...none, onLeave: true, overlapping: [{ timeEntryId: 'e2', spaceId: 'warehouse' }] }))
      .toEqual({ state: 'EXCUSED', reason: 'ELSEWHERE', settledSpaceId: 'warehouse' });
  });

  it('leave, then gone, then the rota changed, then a holiday', () => {
    expect(settleNoShow(inst, { ...none, onLeave: true, memberGone: true, stillPlanned: false, holiday: true })).toMatchObject({ reason: 'LEAVE' });
    expect(settleNoShow(inst, { ...none, memberGone: true, stillPlanned: false, holiday: true })).toMatchObject({ reason: 'LEFT' });
    expect(settleNoShow(inst, { ...none, stillPlanned: false, holiday: true })).toMatchObject({ reason: 'SHIFT_REMOVED' });
    expect(settleNoShow(inst, { ...none, holiday: true })).toMatchObject({ reason: 'HOLIDAY' });
  });
});

describe('a run of misses is one item', () => {
  const row = (id: string, localDate: string, state: string, shiftId = 's1') => ({ id, userId: 'lisa', spaceId: 'office', shiftId, localDate, state });

  it('consecutive open days of the same shift form one run; the newest is its face', () => {
    const runs = noShowRuns([
      row('a', '2026-10-08', 'PRESENT'),
      row('b', '2026-10-09', 'ESCALATED'),
      row('c', '2026-10-12', 'ESCALATED'),
      row('d', '2026-10-13', 'REMINDED'),
    ]);
    expect(runs.get('b')).toMatchObject({ count: 3, latestId: 'd', from: '2026-10-09', to: '2026-10-13', ids: ['b', 'c', 'd'] });
    expect(runs.get('a')).toBeUndefined();
  });

  it('a day they came, or one already decided, breaks the run', () => {
    const runs = noShowRuns([
      row('a', '2026-10-08', 'ESCALATED'),
      row('b', '2026-10-09', 'ABSENT'),
      row('c', '2026-10-10', 'ESCALATED'),
      row('d', '2026-10-11', 'PRESENT'),
      row('e', '2026-10-12', 'ESCALATED'),
    ]);
    expect(runs.get('a')?.count).toBe(1);
    expect(runs.get('c')?.count).toBe(1);
    expect(runs.get('e')?.count).toBe(1);
  });

  it('another shift of the same person is another run; today’s not-yet-due one is ignored', () => {
    const runs = noShowRuns([
      row('a', '2026-10-12', 'ESCALATED', 's1'),
      row('b', '2026-10-12', 'ESCALATED', 's2'),
      row('c', '2026-10-13', 'ESCALATED', 's1'),
      row('d', '2026-10-14', 'PENDING', 's1'),
    ]);
    expect(runs.get('a')).toMatchObject({ count: 2, latestId: 'c' });
    expect(runs.get('b')).toMatchObject({ count: 1 });
  });
});

describe('the record and the decision', () => {
  it('late is a clock-in more than 10 minutes after the planned start', () => {
    const at = '2026-10-14T07:00:00Z';
    expect(noShowDayMark({ state: 'PRESENT', expectedClockInAt: at }, '2026-10-14T07:09:00Z')).toBe('worked');
    expect(noShowDayMark({ state: 'PRESENT', expectedClockInAt: at }, '2026-10-14T07:42:00Z')).toBe('late');
    // New entries read the label itself: the shift's own grace, and only the first entry is ever late.
    expect(
      noShowDayMark({ state: 'PRESENT', expectedClockInAt: at }, '2026-10-14T07:12:00Z', { labelRules: 1, flagReasons: [] }),
    ).toBe('worked');
    expect(
      noShowDayMark({ state: 'PRESENT', expectedClockInAt: at }, '2026-10-14T07:06:00Z', {
        labelRules: 1,
        flagReasons: ['LATE_ARRIVAL'],
      }),
    ).toBe('late');
    expect(noShowDayMark({ state: 'ABSENT', expectedClockInAt: at })).toBe('absent');
    expect(noShowDayMark({ state: 'ESCALATED', expectedClockInAt: at })).toBe('open');
  });

  it('excused carries what happened; absent and the whole run travel to the route', () => {
    expect(approvalRoute({ kind: 'noShow', id: 'x', action: 'approve', reasonCode: 'SICK', wholeRun: true }))
      .toEqual({ ok: true, method: 'PATCH', path: '/attendance/no-shows/x', body: { action: 'excuse', reasonCode: 'SICK', wholeRun: true } });
    expect(approvalRoute({ kind: 'noShow', id: 'x', action: 'reject' }))
      .toEqual({ ok: true, method: 'PATCH', path: '/attendance/no-shows/x', body: { action: 'absent' } });
    // An unknown reason is not passed on as if it were one.
    expect(approvalRoute({ kind: 'noShow', id: 'x', action: 'approve', reasonCode: 'HOLIDAY' })).toMatchObject({ body: { reasonCode: 'OTHER' } });
  });

  it('"They were here" fills the form in the workspace’s own hours', () => {
    expect(noShowAttendancePrefill({
      userId: 'lisa', spaceId: 'office', timezone: 'Europe/Vienna',
      expectedClockInAt: '2026-10-14T09:11:00Z', expectedClockOutAt: '2026-10-14T17:11:00Z',
    })).toEqual({ userId: 'lisa', locationId: 'office', date: '2026-10-14', startTime: '11:11', endTime: '19:11' });
    expect(noShowAttendancePrefill({ userId: 'lisa' })).toBeNull();
  });
});
