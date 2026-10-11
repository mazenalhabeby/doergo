import { leaveCostInBalanceYear, leaveLedgerSource, leaveYearDayFromQuery, parseLeavePolicy } from '@hbcfield/shared';

/* The leave ledger as the API carries it (packages/shared/src/leave/leave-api.ts). */
describe('leave ledger — the API contract', () => {
  it('which leave year a query means: on wins, year = the one starting in it, nothing = today, junk = null', () => {
    expect(leaveYearDayFromQuery({ on: '2026-08-14' }, '2026-10-11')).toBe('2026-08-14');
    expect(leaveYearDayFromQuery({ year: '2025' }, '2026-10-11')).toBe('2025-12-31');
    expect(leaveYearDayFromQuery({}, '2026-10-11')).toBe('2026-10-11');
    expect(leaveYearDayFromQuery({ on: '14.08.2026' }, '2026-10-11')).toBeNull();
    expect(leaveYearDayFromQuery({ year: 'x' }, '2026-10-11')).toBeNull();
  });

  it('the leave policy: optional fields, UP_TO needs a maximum, other modes clear it', () => {
    expect(parseLeavePolicy({ defaultLeaveAllowance: 25 })).toEqual({ ok: true, value: { defaultLeaveAllowance: 25 } });
    expect(parseLeavePolicy({ carryOverMode: 'UP_TO' })).toEqual({ ok: false, code: 'CARRY_OVER_MAX_INVALID' });
    expect(parseLeavePolicy({ carryOverMode: 'ALL', carryOverMaxDays: 5 })).toEqual({ ok: true, value: { carryOverMode: 'ALL', carryOverMaxDays: null } });
    expect(parseLeavePolicy({ leaveYearMode: 'FISCAL' })).toEqual({ ok: false, code: 'LEAVE_YEAR_MODE_INVALID' });
    expect(parseLeavePolicy({ carryExpiresAfterMonths: 0 })).toEqual({ ok: false, code: 'CARRY_EXPIRY_INVALID' });
    expect(parseLeavePolicy({ leaveTrackingStartedOn: '2026-08-01' })).toEqual({ ok: true, value: { leaveTrackingStartedOn: '2026-08-01' } });
    expect(parseLeavePolicy({})).toEqual({ ok: false, code: 'LEAVE_POLICY_EMPTY' });
  });

  it('the request preview charges only the days inside the balance’s leave year', () => {
    const cost = { counted: 4, byYear: { '2026': 2, '2027': 2 }, byLeaveYear: { '2026-03-15': 3, '2027-03-15': 1 } };
    expect(leaveCostInBalanceYear({ year: 2026, leaveYear: { start: '2026-03-15' } }, cost)).toBe(3);
    expect(leaveCostInBalanceYear({ year: 2026 }, cost)).toBe(2); // a server from before the ledger
    expect(leaveCostInBalanceYear({ year: 2026 }, { counted: 4 })).toBe(4);
  });

  it('where a line came from', () => {
    expect(leaveLedgerSource(null)).toBe('MANUAL');
    expect(leaveLedgerSource('opening-carry:u:2026-01-01')).toBe('OPENING');
    expect(leaveLedgerSource('carry:u:2026-01-01')).toBe('CARRY_RULE');
  });
});
