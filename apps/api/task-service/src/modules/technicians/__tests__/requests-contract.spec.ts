import {
  ABSENCE_WHERE,
  INFORMATIONAL_FLAGS,
  applyApprovedRequests,
  isAbsence,
  parseRequestInput,
  requestKindsOffered,
} from '@hbcfield/shared';

/*
  The requests contract (packages/shared/src/requests). Server, phone and web
  read these answers — a change here is a product change.
*/
describe('requests — the shared contract', () => {
  it('only leave is an absence; a row with no kind is old leave', () => {
    expect(isAbsence('LEAVE')).toBe(true);
    expect(isAbsence(null)).toBe(true);
    for (const k of ['REMOTE', 'HOURS', 'OVERTIME', 'OTHER']) expect(isAbsence(k)).toBe(false);
    expect(ABSENCE_WHERE).toEqual({ kind: 'LEAVE' });
  });

  it('offers every kind when the workspace lists none, REMOTE only to who may work remotely', () => {
    expect(requestKindsOffered({ enabled: [], mayWorkRemotely: true })).toEqual(['LEAVE', 'REMOTE', 'HOURS', 'OVERTIME', 'OTHER']);
    expect(requestKindsOffered({ enabled: null, mayWorkRemotely: false })).not.toContain('REMOTE');
    expect(requestKindsOffered({ enabled: ['LEAVE', 'REMOTE', 'junk'], mayWorkRemotely: true })).toEqual(['LEAVE', 'REMOTE']);
  });

  it('reads what old phones send as vacation leave', () => {
    expect(parseRequestInput({ startDate: '2026-11-14', endDate: '2026-11-18' })).toEqual({
      ok: true,
      value: { kind: 'LEAVE', type: 'VACATION', startDate: '2026-11-14', endDate: '2026-11-18', reason: null },
    });
  });

  it.each([
    [{ kind: 'NAP', startDate: '2026-11-14' }, 'REQUEST_KIND_INVALID'],
    [{ startDate: '2026-11-18', endDate: '2026-11-14' }, 'REQUEST_DATES_INVALID'],
    [{ kind: 'LEAVE', type: 'BEACH', startDate: '2026-11-14' }, 'REQUEST_TYPE_INVALID'],
    [{ kind: 'REMOTE', startDate: '2026-11-14' }, 'REQUEST_SPACE_REQUIRED'],
    [{ kind: 'REMOTE', spaceId: 's', startDate: '2026-11-01', endDate: '2026-12-15' }, 'REQUEST_TOO_MANY_DAYS'],
    [{ kind: 'HOURS', startDate: '2026-11-14' }, 'REQUEST_TIME_INVALID'],
    [{ kind: 'HOURS', startDate: '2026-11-14', startTime: '17:00', endTime: '10:00' }, 'REQUEST_TIME_INVALID'],
    [{ kind: 'HOURS', startDate: '2026-11-14', endDate: '2026-11-15', startTime: '10:00' }, 'REQUEST_DATES_INVALID'],
    [{ kind: 'OVERTIME', startDate: '2026-11-14', minutes: 5 }, 'REQUEST_MINUTES_INVALID'],
    [{ kind: 'OTHER', startDate: '2026-11-14' }, 'REQUEST_REASON_REQUIRED'],
    [{ startDate: '2026-11-14', reason: 'x'.repeat(501) }, 'REQUEST_REASON_TOO_LONG'],
  ])('refuses %j with %s', (body, code) => {
    expect(parseRequestInput(body)).toEqual({ ok: false, code });
  });

  it('drops fields that do not belong to the kind', () => {
    const r = parseRequestInput({ kind: 'LEAVE', startDate: '2026-11-14', minutes: 120, spaceId: 's', startTime: '10:00' });
    expect(r).toEqual({ ok: true, value: { kind: 'LEAVE', type: 'VACATION', startDate: '2026-11-14', endDate: '2026-11-14', reason: null } });
  });

  describe('applying a day of approved requests', () => {
    const atLocal = (hhmm: string) => new Date(`2026-11-14T${hhmm}:00Z`);
    const base = { spaceId: 'office', expectedClockInAt: atLocal('08:00'), expectedClockOutAt: atLocal('16:00'), atLocal };

    it('a remote day at this workspace removes the away review; elsewhere it does not apply', () => {
      expect(applyApprovedRequests({ ...base, requests: [{ id: 'r1', kind: 'REMOTE', spaceId: 'office' }] }).remoteApproved).toBe(true);
      expect(applyApprovedRequests({ ...base, requests: [{ id: 'r1', kind: 'REMOTE', spaceId: 'yard' }] }).remoteApproved).toBe(false);
    });

    it('a changed day moves the start; overtime extends the (changed) end', () => {
      const e = applyApprovedRequests({
        ...base,
        requests: [
          { id: 'o', kind: 'OVERTIME', minutes: 120 },
          { id: 'h', kind: 'HOURS', startTime: '10:00', endTime: '18:00' },
        ],
      });
      expect(e.expectedClockInAt).toEqual(atLocal('10:00'));
      expect(e.expectedClockOutAt).toEqual(atLocal('20:00'));
      expect(e.requestIds.sort()).toEqual(['h', 'o']);
    });

    it('changes nothing with no approved request — and says so with nulls', () => {
      expect(applyApprovedRequests({ ...base, requests: [] })).toEqual({ remoteApproved: false, expectedClockInAt: null, expectedClockOutAt: null, requestIds: [] });
    });
  });

  it('the approved-remote flag never sends an entry to review', () => {
    expect(INFORMATIONAL_FLAGS.has('APPROVED_REMOTE')).toBe(true);
  });
});
