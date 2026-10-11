import { auditAction, auditBody } from '../interceptors/audit-helpers';

/**
 * Every write to somebody's leave balance is named in the audit log, and the starting-balances
 * table (up to 500 people) is kept as a count — each line is in the ledger itself with who wrote
 * it and when, so the log does not need a second copy of the table.
 */
describe('leave ledger in the audit log', () => {
  it.each([
    ['POST', '/employees/:id/leave-adjustments', 'LEAVE_ADJUSTMENT_ADDED'],
    ['POST', '/employees/leave-adjustments/:id/void', 'LEAVE_ADJUSTMENT_VOIDED'],
    ['POST', '/employees/leave-opening', 'LEAVE_OPENING_BALANCES_SAVED'],
    ['POST', '/employees/leave-opening/match', 'LEAVE_OPENING_TABLE_MATCHED'],
    ['PATCH', '/organizations/leave-policy', 'LEAVE_POLICY_UPDATED'],
  ])('%s %s → %s', (method, route, action) => {
    expect(auditAction(method, route)).toBe(action);
  });

  it('keeps the size of a starting-balances table, never its people', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ userId: `u${i}`, used: 3, carried: 1 }));
    expect(auditBody('POST', '/employees/leave-opening', { on: '2026-08-01', rows })).toEqual({ on: '2026-08-01', rows: 120 });
    expect(auditBody('POST', '/employees/leave-opening/match', { text: 'mark@example.com;10;2' })).toEqual({ characters: 21 });
  });

  it('a single adjustment keeps its body (kind, days, reason) — it is one person and small', () => {
    expect(auditBody('POST', '/employees/:id/leave-adjustments', { kind: 'GRANT', days: 2, on: '2026-08-14', reason: 'Wedding' }))
      .toEqual({ kind: 'GRANT', days: 2, on: '2026-08-14', reason: 'Wedding' });
  });
});
