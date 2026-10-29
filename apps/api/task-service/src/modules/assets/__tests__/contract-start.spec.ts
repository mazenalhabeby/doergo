import { contractCustodyStart } from '../proposals/asset-contract-helpers';

/**
 * When custody from a contract starts: never in the future, never before the
 * member's current custody of what it replaces, never older than any asset
 * entry may be (120 days unless org-wide canManageAssets).
 */
const now = new Date('2026-10-29T10:00:00Z');
const day = 86_400_000;

describe('contractCustodyStart', () => {
  it('a future term starts today (clamped)', () => {
    const r = contractCustodyStart(new Date(now.getTime() + 7 * day), { now, holdingSince: [] });
    expect(r).toEqual({ startsAt: now, startClamped: true, startRaised: false });
  });

  it('a term before the replaced van was handed over starts when it was (raised)', () => {
    const since = new Date('2026-10-01T08:00:00Z');
    const r = contractCustodyStart(new Date('2026-09-20T00:00:00Z'), { now, holdingSince: [since] });
    expect(r).toEqual({ startsAt: since, startClamped: false, startRaised: true });
  });

  it('a term older than 120 days is raised to the window — unless the org-wide office records it', () => {
    const old = new Date(now.getTime() - 200 * day);
    const member = contractCustodyStart(old, { now, holdingSince: [] });
    expect(member.startRaised).toBe(true);
    expect(member.startsAt.getTime()).toBe(now.getTime() - 120 * day);
    const office = contractCustodyStart(old, { now, holdingSince: [], canManageAssets: true });
    expect(office).toEqual({ startsAt: old, startClamped: false, startRaised: false });
  });

  it('a term inside every bound is kept as it is', () => {
    const asked = new Date(now.getTime() - 10 * day);
    expect(contractCustodyStart(asked, { now, holdingSince: [new Date(now.getTime() - 30 * day)] })).toEqual({
      startsAt: asked,
      startClamped: false,
      startRaised: false,
    });
  });
});
