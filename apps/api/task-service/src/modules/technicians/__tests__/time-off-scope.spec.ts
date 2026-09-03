/**
 * Whose leave a supervisor may see, and decide.
 *
 * `TimeOff` has no space column — leave belongs to a PERSON, not to a site —
 * so this read looked unscopeable and stayed org-wide behind
 * `@RequirePermission('canViewAllTasks')`. The consequence was that a
 * supervisor could see their crew's hours, their shifts and their blockers, and
 * not whether any of them were on holiday next week, which is half of running a
 * rota.
 *
 * The claim was never over the leave. It is over the PEOPLE — so the query
 * narrows through the roster, and no schema change is needed.
 */
describe('time off, scoped through the roster', () => {
  /** `getOrgTimeOff` as the service applies it. */
  const visible = (
    scopeSpaceIds: string[] | undefined,
    rows: { id: string; spaces: string[] }[],
  ) => {
    if (scopeSpaceIds === undefined) return rows.map((r) => r.id); // org-wide
    if (scopeSpaceIds.length === 0) return []; // granted nowhere
    return rows.filter((r) => r.spaces.some((s) => scopeSpaceIds.includes(s))).map((r) => r.id);
  };

  const rows = [
    { id: 'mine', spaces: ['s1'] },
    { id: 'both', spaces: ['s1', 's2'] },
    { id: 'theirs', spaces: ['s2'] },
    { id: 'unrostered', spaces: [] },
  ];

  it('an org-wide viewer sees everything, exactly as before', () => {
    expect(visible(undefined, rows)).toEqual(['mine', 'both', 'theirs', 'unrostered']);
  });

  it('a supervisor sees their own crew', () => {
    expect(visible(['s1'], rows)).toEqual(['mine', 'both']);
  });

  it('and somebody who works at two sites appears to both their leads', () => {
    expect(visible(['s2'], rows)).toEqual(['both', 'theirs']);
  });

  it('nobody rostered anywhere is invisible to a scoped viewer', () => {
    expect(visible(['s1'], rows)).not.toContain('unrostered');
  });

  /*
    The three-state convention, which is the one that bites.

    An empty array means "granted nowhere" and must match NOTHING. Collapsing it
    with undefined — the org-wide case — turns a scoped read into a full one,
    silently, for exactly the members who hold least.
  */
  it('granted nowhere sees nothing, not everything', () => {
    expect(visible([], rows)).toEqual([]);
  });

  /*
    Approving is checked separately, because the route takes a request id
    straight from the caller: without it, a member who leads one site could
    approve leave for anybody in the company by id.
  */
  describe('approving one request', () => {
    const mayApprove = (scopeSpaceIds: string[] | undefined, theirSpaces: string[]) => {
      if (scopeSpaceIds === undefined) return true;
      return theirSpaces.some((s) => scopeSpaceIds.includes(s));
    };

    it('an org-wide approver may decide any request', () => {
      expect(mayApprove(undefined, ['s2'])).toBe(true);
    });

    it('a supervisor may decide for their own crew', () => {
      expect(mayApprove(['s1'], ['s1', 's3'])).toBe(true);
    });

    it('and not for somebody at another site, however the id was found', () => {
      expect(mayApprove(['s1'], ['s2'])).toBe(false);
    });

    it('and not for somebody on no roster at all', () => {
      expect(mayApprove(['s1'], [])).toBe(false);
    });
  });
});
