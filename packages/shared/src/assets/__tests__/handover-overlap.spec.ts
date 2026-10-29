import { planHandover, type CustodyPeriod } from '../custody';

/**
 * A back-dated handover must not open a period over a CLOSED one: Bea had the
 * van until Wednesday, so "Carl got it on Monday" would give a one-at-a-time
 * van two holders for three days.
 */
const now = new Date('2026-09-10T12:00:00Z');
const bea: CustodyPeriod = { id: 'b', userId: 'bea', startedAt: '2026-09-01T08:00:00Z', endedAt: '2026-09-09T08:00:00Z' };

describe('planHandover — back-dated over a closed period', () => {
  it('refuses on a one-at-a-time kind', () => {
    const plan = planHandover({ periods: [bea], to: [{ userId: 'carl' }], at: '2026-09-07T08:00:00Z', limit: 1, now });
    expect(plan.problems).toEqual([{ kind: 'overlaps-past', period: bea }]);
  });

  it('allows a date after the closed period ended', () => {
    const plan = planHandover({ periods: [bea], to: [{ userId: 'carl' }], at: '2026-09-09T09:00:00Z', limit: 1, now });
    expect(plan.problems).toEqual([]);
  });

  it('on a kind held by several, refuses only the same party twice', () => {
    const other = planHandover({ periods: [bea], to: [{ userId: 'carl' }], at: '2026-09-07T08:00:00Z', limit: 3, now });
    expect(other.problems).toEqual([]);
    const same = planHandover({ periods: [bea], to: [{ userId: 'bea' }], at: '2026-09-07T08:00:00Z', limit: 3, now });
    expect(same.problems.map((p) => p.kind)).toEqual(['overlaps-past']);
  });
});
