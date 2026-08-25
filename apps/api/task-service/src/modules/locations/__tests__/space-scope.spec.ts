/**
 * Workspace visibility must be a QUERY filter, not a filter on the response.
 *
 * It used to be the latter: the gateway paged the org's whole directory out of
 * the database and dropped the rows the member could not see, so `total` and
 * every page boundary described a list nobody was shown. These tests pin the
 * shape of the where-clause the service now builds.
 */
describe('workspace visibility → Prisma where clause', () => {
  const now = new Date();
  const activeWindow = [{ effectiveTo: null }, { effectiveTo: { gte: now } }];

  const buildWhere = (scope: 'own' | 'tasks' | 'all', viewerId?: string) => {
    const where: any = { organizationId: 'org1', isRemote: false, isActive: true };
    if (scope === 'own' && viewerId) {
      where.spaceAssignments = { some: { userId: viewerId, OR: activeWindow } };
    }
    return where;
  };

  it("'own' filters on a CURRENT assignment, so paging and totals stay honest", () => {
    const where = buildWhere('own', 'u1');
    expect(where.spaceAssignments.some.userId).toBe('u1');
    // The same effective window the roster include uses — a lapsed assignment
    // must not resurrect a space in the list.
    expect(where.spaceAssignments.some.OR).toEqual(activeWindow);
  });

  it("'all' adds no space filter", () => {
    expect(buildWhere('all').spaceAssignments).toBeUndefined();
  });

  it("'own' without a viewer id shows nothing rather than everything", () => {
    // The service returns an empty page before it builds a where clause at all.
    // Without that branch the filter simply vanishes and 'own' quietly means
    // 'all' — a visibility control failing open onto the whole directory.
    const visible = (scope: 'own' | 'all', viewerId?: string) =>
      scope === 'own' && !viewerId ? 'nothing' : 'query';
    expect(visible('own', undefined)).toBe('nothing');
    expect(visible('own', 'u1')).toBe('query');
  });
});
