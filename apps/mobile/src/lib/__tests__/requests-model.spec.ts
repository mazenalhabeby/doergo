/**
 * Requests on the phone: what a request is called, and how a form becomes the
 * body the server takes — validated by the contract's own parser.
 */
import {
  balancePreview, describeRequest, draftToBody, hoursFact, kindEffectKey, kindLabelKey, legacyLabelMap,
  queuedRequestRow, splitLegacyReason, stepOvertime,
} from '../../features/requests/request-model';
import { datesWithStatus, timeOffStats } from '../../features/time-off/helpers';

const legacy = legacyLabelMap([
  ['VACATION', 'Vacation'], ['SICK', 'Sick Leave'], ['FAMILY', 'Family'], ['OTHER', 'Other'],
  ['SICK', 'Krankenstand'],
]);

describe('what a request is called', () => {
  it('a kind other than leave is named by its kind', () => {
    expect(describeRequest({ kind: 'REMOTE', reason: 'Delivery at home' })).toEqual({
      kind: 'REMOTE', titleKey: 'requests.kind.REMOTE', leaveType: null, note: 'Delivery at home',
    });
    expect(kindLabelKey('OVERTIME')).toBe('requests.kind.OVERTIME');
  });

  it('a row with no kind is leave, named by its type', () => {
    expect(describeRequest({ type: 'SICK', reason: 'flu' }).titleKey).toBe('timeOff.reasonTypes.sickLeave');
    expect(describeRequest({ kind: null, type: 'VACATION', reason: null })).toMatchObject({ kind: 'LEAVE', leaveType: 'VACATION', note: '' });
    expect(describeRequest({}).titleKey).toBe('requests.kind.LEAVE');
  });

  it('an old phone wrote the kind into the reason — and the server stored VACATION', () => {
    expect(describeRequest({ type: 'VACATION', reason: 'Sick Leave: flu' }, legacy)).toMatchObject({ leaveType: 'SICK', note: 'flu' });
    expect(describeRequest({ type: 'VACATION', reason: 'Krankenstand' }, legacy)).toMatchObject({ leaveType: 'SICK', note: '' });
    // A chosen type other than the default is a real choice and wins.
    expect(describeRequest({ type: 'FAMILY', reason: 'Sick Leave: flu' }, legacy).leaveType).toBe('FAMILY');
  });

  it('a note that merely has a colon is never split', () => {
    expect(splitLegacyReason('Doctor: 10am', legacy)).toEqual({ type: null, note: 'Doctor: 10am' });
    expect(describeRequest({ type: 'VACATION', reason: 'Doctor: 10am' }, legacy)).toMatchObject({ leaveType: 'VACATION', note: 'Doctor: 10am' });
  });

  it('only kinds that shape a day say what approving does', () => {
    expect(kindEffectKey('REMOTE')).toBe('requests.effect.REMOTE');
    expect(kindEffectKey('HOURS')).toBe('requests.effect.HOURS');
    expect(kindEffectKey('OVERTIME')).toBe('requests.effect.OVERTIME');
    expect(kindEffectKey('LEAVE')).toBeNull();
    expect(kindEffectKey('OTHER')).toBeNull();
  });

  it('the facts of a changed day', () => {
    expect(hoursFact('10:00', '16:00')).toEqual({ key: 'requests.facts.between', values: { start: '10:00', end: '16:00' } });
    expect(hoursFact('10:00', null)?.key).toBe('requests.facts.startsAt');
    expect(hoursFact(null, '15:00')?.key).toBe('requests.facts.endsAt');
    expect(hoursFact(null, null)).toBeNull();
  });
});

describe('the form → the body', () => {
  it('leave carries NO kind (an older server refuses unknown fields), and its type', () => {
    expect(draftToBody({ kind: 'LEAVE', startDate: '2026-11-14', endDate: '2026-11-18', type: 'SICK', reason: '  flu ' }))
      .toEqual({ ok: true, body: { startDate: '2026-11-14', endDate: '2026-11-18', type: 'SICK', reason: 'flu' } });
    expect(draftToBody({ kind: 'LEAVE', startDate: '2026-11-14', reason: '' }))
      .toEqual({ ok: true, body: { startDate: '2026-11-14', endDate: '2026-11-14', type: 'VACATION' } });
  });

  it('remote needs a workspace and keeps it', () => {
    expect(draftToBody({ kind: 'REMOTE', startDate: '2026-11-12', spaceId: null })).toEqual({ ok: false, code: 'REQUEST_SPACE_REQUIRED' });
    expect(draftToBody({ kind: 'REMOTE', startDate: '2026-11-12', endDate: '2026-11-13', spaceId: 's1', reason: 'Handover' }))
      .toEqual({ ok: true, body: { kind: 'REMOTE', startDate: '2026-11-12', endDate: '2026-11-13', spaceId: 's1', reason: 'Handover' } });
  });

  it('hours is one day, with a start and/or an end, the end after the start', () => {
    expect(draftToBody({ kind: 'HOURS', startDate: '2026-11-16', endDate: '2026-11-20', startTime: '10:00' }))
      .toEqual({ ok: true, body: { kind: 'HOURS', startDate: '2026-11-16', endDate: '2026-11-16', startTime: '10:00' } });
    expect(draftToBody({ kind: 'HOURS', startDate: '2026-11-16' })).toEqual({ ok: false, code: 'REQUEST_TIME_INVALID' });
    expect(draftToBody({ kind: 'HOURS', startDate: '2026-11-16', startTime: '16:00', endTime: '10:00' })).toEqual({ ok: false, code: 'REQUEST_TIME_INVALID' });
  });

  it('overtime is one day and minutes within the limits', () => {
    expect(draftToBody({ kind: 'OVERTIME', startDate: '2026-11-14', minutes: 120 }))
      .toEqual({ ok: true, body: { kind: 'OVERTIME', startDate: '2026-11-14', endDate: '2026-11-14', minutes: 120 } });
    expect(draftToBody({ kind: 'OVERTIME', startDate: '2026-11-14', minutes: 5 })).toEqual({ ok: false, code: 'REQUEST_MINUTES_INVALID' });
  });

  it('other needs words; no day is no request', () => {
    expect(draftToBody({ kind: 'OTHER', startDate: '2026-11-14', reason: '   ' })).toEqual({ ok: false, code: 'REQUEST_REASON_REQUIRED' });
    expect(draftToBody({ kind: 'OTHER', startDate: null, reason: 'x' })).toEqual({ ok: false, code: 'REQUEST_DATES_INVALID' });
  });

  it('overtime steps by a quarter hour inside the limits', () => {
    expect(stepOvertime(60, 1)).toBe(75);
    expect(stepOvertime(15, -1)).toBe(15);
    expect(stepOvertime(720, 1)).toBe(720);
  });
});

describe('the leave preview', () => {
  const balance = { year: 2026, remaining: 15, pending: 3 };
  it('vacation: what is left after waiting requests, then after this one (this year only)', () => {
    expect(balancePreview(balance, { counted: 3, byYear: { 2026: 3 } }, 'VACATION')).toEqual({ before: 12, after: 9 });
    expect(balancePreview(balance, { counted: 4, byYear: { 2026: 2, 2027: 2 } }, 'VACATION')).toEqual({ before: 12, after: 10 });
  });
  it('nothing for other leave types, or while either number is unknown', () => {
    expect(balancePreview(balance, { counted: 3 }, 'SICK')).toBeNull();
    expect(balancePreview(null, { counted: 3 }, 'VACATION')).toBeNull();
    expect(balancePreview(balance, null, 'VACATION')).toBeNull();
  });
});

describe('a request still on the phone, and what counts as days off', () => {
  it('every field of a queued body travels into the list row', () => {
    const row = queuedRequestRow({ id: 'q1', createdAt: 0, body: { kind: 'REMOTE', startDate: '2026-11-12', endDate: '2026-11-12', spaceId: 's1' } }, 'me');
    expect(row).toMatchObject({ id: 'q1', kind: 'REMOTE', spaceId: 's1', status: 'PENDING', pendingSync: true });
    expect(queuedRequestRow({ id: 'q2', createdAt: 0, body: { startDate: '2026-11-12', endDate: '2026-11-12', type: 'SICK' } }, 'me'))
      .toMatchObject({ kind: 'LEAVE', type: 'SICK' });
  });

  it('only leave marks the month and counts as days used — a remote day is a day worked', () => {
    const rows = [
      { startDate: '2026-10-01', endDate: '2026-10-02', status: 'APPROVED' as const, kind: 'LEAVE' as const },
      { startDate: '2026-10-05', endDate: '2026-10-05', status: 'APPROVED' as const, kind: 'REMOTE' as const },
      { startDate: '2026-10-20', endDate: '2026-10-20', status: 'PENDING' as const, kind: 'OVERTIME' as const },
    ];
    expect(Object.keys(datesWithStatus(rows, 'APPROVED'))).toEqual(['2026-10-01', '2026-10-02']);
    expect(Object.keys(datesWithStatus(rows, 'PENDING'))).toEqual([]);
    expect(timeOffStats(rows, new Date(2026, 9, 10))).toEqual({ daysUsed: 2, upcoming: 0, pending: 1, rejected: 0 });
  });
});
