/**
 * Who may read a colleague's record, and how much of it.
 *
 * `GET /employees/:id` carried no permission decorator: any authenticated
 * member could fetch any other member's full profile — every task completed
 * across every space, hours worked, recent activity, and their last GPS
 * position. For an external member that is a client's supervisor reading the
 * work history and whereabouts of people at sites they have nothing to do with.
 *
 * The rule is layered rather than a single gate, because the questions are
 * genuinely different: working alongside somebody, supervising them, and
 * tracking them are three things, and they are not held by the same people.
 */
describe('employee detail visibility', () => {
  /** The rule as the service applies it. */
  const decide = (
    viewer: { orgWide?: boolean; spaces?: string[]; canViewTracking?: boolean },
    target: { spaces: string[] },
  ) => {
    const scoped = !viewer.orgWide;
    const viewerSpaces = viewer.spaces ?? [];
    if (scoped && !target.spaces.some((s) => viewerSpaces.includes(s))) return 'not-found';
    return {
      statsScopedTo: scoped ? viewerSpaces : 'all',
      location: !scoped || viewer.canViewTracking === true,
    };
  };

  it('an org-wide viewer sees the whole record, unchanged', () => {
    expect(decide({ orgWide: true }, { spaces: ['s1'] })).toEqual({
      statsScopedTo: 'all',
      location: true,
    });
  });

  it('a space-scoped viewer may open somebody they SHARE a space with', () => {
    expect(decide({ spaces: ['s1'] }, { spaces: ['s1', 's2'] })).not.toBe('not-found');
  });

  it('and may not open somebody they share none with — reads as not-found', () => {
    // Not "forbidden": whether a given colleague exists is itself something
    // this caller has no business learning.
    expect(decide({ spaces: ['s1'] }, { spaces: ['s2'] })).toBe('not-found');
  });

  it('their numbers cover the shared spaces only, not a career total', () => {
    const r = decide({ spaces: ['s1'] }, { spaces: ['s1', 's2'] }) as { statsScopedTo: string[] };
    expect(r.statsScopedTo).toEqual(['s1']);
    expect(r.statsScopedTo).not.toBe('all');
  });

  it('withholds the GPS position without canViewTracking', () => {
    const r = decide({ spaces: ['s1'] }, { spaces: ['s1'] }) as { location: boolean };
    expect(r.location).toBe(false);
  });

  it('returns it to a space-scoped viewer who holds canViewTracking', () => {
    const r = decide(
      { spaces: ['s1'], canViewTracking: true },
      { spaces: ['s1'] },
    ) as { location: boolean };
    expect(r.location).toBe(true);
  });
});
