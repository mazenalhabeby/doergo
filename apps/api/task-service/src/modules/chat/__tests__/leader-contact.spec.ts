import { isSpaceLeaderPermissions } from '@hbcfield/shared';

/**
 * A space's leadership can message the people in it.
 *
 * Contact routing answered the question in one direction only: a worker may
 * contact their space's leaders. There was no downward half — so a supervisor
 * could approve somebody's overtime, reconcile their shift and read their
 * attendance, and then be told "You are not allowed to contact this member"
 * about the person whose hours they had just signed off.
 *
 * The reach is bounded by the spaces they actually lead, which is what keeps it
 * from becoming "anyone may message anyone".
 */
describe('leader → member contact', () => {
  /** The rule as spaceMembersILead applies it. */
  const reachable = (
    myAssignments: { spaceId: string; permissions: Record<string, boolean>; isActive?: boolean }[],
    rosterBySpace: Record<string, string[]>,
    me = 'me',
  ) => {
    const led = myAssignments
      .filter((a) => a.isActive !== false && isSpaceLeaderPermissions(a.permissions))
      .map((a) => a.spaceId);
    const out = new Set<string>();
    for (const s of led) for (const u of rosterBySpace[s] ?? []) if (u !== me) out.add(u);
    return out;
  };

  const LEADER = { canViewSpaceAttendance: true, canApproveOvertime: true };
  const WORKER = { canCreateTasks: true };

  it('reaches the people in a space they lead', () => {
    const r = reachable([{ spaceId: 's1', permissions: LEADER }], { s1: ['worker-a', 'worker-b'] });
    expect([...r].sort()).toEqual(['worker-a', 'worker-b']);
  });

  it('does NOT reach people in a space they merely belong to', () => {
    const r = reachable(
      [{ spaceId: 's1', permissions: LEADER }, { spaceId: 's2', permissions: WORKER }],
      { s1: ['worker-a'], s2: ['stranger'] },
    );
    expect(r.has('worker-a')).toBe(true);
    expect(r.has('stranger')).toBe(false);
  });

  it('reaches nobody when they lead nothing', () => {
    const r = reachable([{ spaceId: 's1', permissions: WORKER }], { s1: ['worker-a'] });
    expect(r.size).toBe(0);
  });

  it('ignores a deactivated role — leadership it no longer confers', () => {
    const r = reachable([{ spaceId: 's1', permissions: LEADER, isActive: false }], { s1: ['worker-a'] });
    expect(r.size).toBe(0);
  });

  it('never includes themselves', () => {
    const r = reachable([{ spaceId: 's1', permissions: LEADER }], { s1: ['me', 'worker-a'] });
    expect(r.has('me')).toBe(false);
  });
});
