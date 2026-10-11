import {
  carryExpiredDays,
  carryExpiryDate,
  carryOverDays,
  leaveBalance,
  leaveYearOf,
  parseLeaveAdjustment,
  parseOpeningBalances,
  previousLeaveYear,
} from '@hbcfield/shared';

/* The leave ledger (packages/shared/src/leave). Server, phone and web read these answers. */
describe('leave ledger — the shared contract', () => {
  it('Mark: 25 − 10 used before HBCField − 3 taken + 2 carried = 14, lines in order', () => {
    const b = leaveBalance({
      allowance: 25,
      adjustments: [{ kind: 'OPENING_USED', days: -10 }, { kind: 'CARRY_OVER', days: 2 }],
      taken: 3,
      pending: 2,
    });
    expect(b.remaining).toBe(14);
    expect(b.pending).toBe(2);
    expect(b.lines).toEqual([
      { key: 'ALLOWANCE', days: 25 },
      { key: 'OPENING_USED', days: -10 },
      { key: 'CARRY_OVER', days: 2 },
      { key: 'TAKEN', days: -3 },
    ]);
  });

  it('ignores unknown kinds and keeps half days', () => {
    expect(leaveBalance({ allowance: 12.5, adjustments: [{ kind: 'HACK', days: 99 }], taken: 0.5, pending: 0 }).remaining).toBe(12);
  });

  describe('leave year', () => {
    it('calendar year by default and when no start date is recorded', () => {
      expect(leaveYearOf({ mode: 'CALENDAR', on: '2026-08-14' })).toEqual({ mode: 'CALENDAR', start: '2026-01-01', end: '2026-12-31' });
      expect(leaveYearOf({ mode: 'WORK_YEAR', on: '2026-08-14' }).mode).toBe('CALENDAR');
    });
    it('work year runs from the anniversary', () => {
      expect(leaveYearOf({ mode: 'WORK_YEAR', employmentStartDate: '2019-04-15', on: '2026-08-14' })).toEqual({ mode: 'WORK_YEAR', start: '2026-04-15', end: '2027-04-14' });
      expect(leaveYearOf({ mode: 'WORK_YEAR', employmentStartDate: '2019-04-15', on: '2026-03-01' })).toEqual({ mode: 'WORK_YEAR', start: '2025-04-15', end: '2026-04-14' });
    });
    it('a 29 February start falls on the 28th in other years', () => {
      expect(leaveYearOf({ mode: 'WORK_YEAR', employmentStartDate: '2020-02-29', on: '2026-06-01' })).toEqual({ mode: 'WORK_YEAR', start: '2026-02-28', end: '2027-02-27' });
    });
    it('the previous leave year', () => {
      const y = leaveYearOf({ mode: 'WORK_YEAR', employmentStartDate: '2019-04-15', on: '2026-08-14' });
      expect(previousLeaveYear(y, '2019-04-15')).toEqual({ mode: 'WORK_YEAR', start: '2025-04-15', end: '2026-04-14' });
    });
  });

  describe('carry-over', () => {
    it('none / up to / all', () => {
      expect(carryOverDays(9, { mode: 'NONE' })).toBe(0);
      expect(carryOverDays(9, { mode: 'UP_TO', maxDays: 5 })).toBe(5);
      expect(carryOverDays(3.5, { mode: 'UP_TO', maxDays: 5 })).toBe(3.5);
      expect(carryOverDays(9, { mode: 'ALL' })).toBe(9);
      expect(carryOverDays(-2, { mode: 'ALL' })).toBe(0);
    });
    it('expiry: end of the third month; carried days are used first', () => {
      expect(carryExpiryDate({ mode: 'CALENDAR', start: '2027-01-01', end: '2027-12-31' }, { mode: 'UP_TO', expiresAfterMonths: 3 })).toBe('2027-03-31');
      expect(carryExpiryDate({ mode: 'CALENDAR', start: '2027-01-01', end: '2027-12-31' }, { mode: 'ALL' })).toBeNull();
      expect(carryExpiredDays({ carried: 5, takenUpToExpiry: 2 })).toBe(3);
      expect(carryExpiredDays({ carried: 5, takenUpToExpiry: 8 })).toBe(0);
    });
  });

  describe('hand-entered adjustments', () => {
    it('"used before HBCField: 10" is stored as −10', () => {
      expect(parseLeaveAdjustment({ kind: 'OPENING_USED', days: 10, on: '2026-08-01' })).toEqual({
        ok: true, value: { kind: 'OPENING_USED', days: -10, on: '2026-08-01', reason: null },
      });
    });
    it.each([
      [{ kind: 'CARRY_OVER', days: 3, on: '2026-01-01' }, 'ADJUSTMENT_KIND_INVALID'],
      [{ kind: 'CORRECTION', days: 0.3, on: '2026-01-01', reason: 'x' }, 'ADJUSTMENT_DAYS_INVALID'],
      [{ kind: 'CORRECTION', days: 2, on: '2026-01-01' }, 'ADJUSTMENT_REASON_REQUIRED'],
      [{ kind: 'GRANT', days: -1, on: '2026-01-01', reason: 'x' }, 'ADJUSTMENT_DAYS_INVALID'],
      [{ kind: 'OPENING_USED', days: 5, on: 'yesterday' }, 'ADJUSTMENT_DATE_INVALID'],
    ])('refuses %j with %s', (body, code) => {
      expect(parseLeaveAdjustment(body)).toEqual({ ok: false, code });
    });
  });

  it('reads a pasted table from the old system, header and bad lines reported', () => {
    const { rows, errors } = parseOpeningBalances('Email;Used;Carried\nmike@example.com;10;0\nsarah@example.com\t6\t2\nKarim Ahmad,14,\nbad@example.com;ten;1\n');
    expect(rows).toEqual([
      { line: 2, person: 'mike@example.com', used: 10, carried: 0 },
      { line: 3, person: 'sarah@example.com', used: 6, carried: 2 },
      { line: 4, person: 'Karim Ahmad', used: 14, carried: 0 },
    ]);
    expect(errors).toEqual([{ line: 5, text: 'bad@example.com;ten;1' }]);
  });
});
