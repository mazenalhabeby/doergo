import { resolveMemberRouting } from '@hbcfield/shared';

/**
 * Characterization tests for space-driven routing.
 *
 * This is shared by notification routing AND chat contact resolution, so its
 * behaviour is pinned here before the query shape underneath it is changed.
 * Every case below describes what it did before that change, so the refactor
 * has to prove itself rather than be taken on trust.
 */
describe('resolveMemberRouting', () => {
  const ORG = 'org-1';
  const ME = 'user-me';

  const make = (over: Partial<Record<string, any>> = {}) => {
    const state = {
      /** the caller's own assignments (userId = ME) */
      mine: [] as any[],
      /** everyone's assignments, keyed lookup by spaceId */
      holders: [] as any[],
      /** per-space notify/contact role config */
      spaces: [] as any[],
      ...over,
    };
    const queries: string[] = [];
    const prisma: any = {
      spaceAssignment: {
        findMany: ({ where, select }: any) => {
          queries.push('spaceAssignment');
          if (where.userId) {
            return Promise.resolve(
              state.mine
                .filter((a) => !where.organizationId || a.organizationId === where.organizationId)
                .map((a) => ({ ...a })),
            );
          }
          const ids: string[] = where.spaceId?.in ?? [];
          return Promise.resolve(
            state.holders
              .filter((h) => ids.includes(h.spaceId) && h.organizationId === where.organizationId)
              .map((h) => ({ ...h, role: select?.role ? h.role : undefined })),
          );
        },
      },
      companyLocation: {
        findMany: ({ where }: any) => {
          queries.push('companyLocation');
          const ids: string[] = where.id.in;
          return Promise.resolve(state.spaces.filter((s) => ids.includes(s.id)));
        },
      },
    };
    return { prisma, queries };
  };

  const assignment = (spaceId: string, over: any = {}) => ({
    spaceId, organizationId: ORG,
    notifyRoleIds: [], notifyUserIds: [], contactRoleIds: [], contactUserIds: [],
    ...over,
  });
  const holder = (spaceId: string, userId: string, roleId: string | null, leader = false) => ({
    spaceId, userId, roleId, organizationId: ORG,
    role: { permissions: leader ? { canViewSpaceAttendance: true } : {} },
  });
  const space = (id: string, over: any = {}) => ({ id, notifyRoleIds: [], contactRoleIds: [], ...over });

  it('returns nobody when the person belongs to no space', async () => {
    const { prisma } = make();
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))]).toEqual([]);
  });

  it('falls back to the space leaders when nothing is configured', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1')],
      spaces: [space('sp-1')],
      holders: [holder('sp-1', 'boss', 'r-lead', true), holder('sp-1', 'peer', 'r-worker', false)],
    });
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))]).toEqual(['boss']);
  });

  it('honours the space role config over the leader default', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1')],
      spaces: [space('sp-1', { contactRoleIds: ['r-worker'] })],
      holders: [holder('sp-1', 'boss', 'r-lead', true), holder('sp-1', 'peer', 'r-worker', false)],
    });
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))]).toEqual(['peer']);
  });

  it('lets a per-member override name specific people', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1', { contactUserIds: ['chosen'] })],
      spaces: [space('sp-1')],
      holders: [holder('sp-1', 'boss', 'r-lead', true)],
    });
    // The override replaces the space default for THAT space.
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))]).toEqual(['chosen']);
  });

  it('resolves an override given as role ids to their holders', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1', { contactRoleIds: ['r-worker'] })],
      spaces: [space('sp-1')],
      holders: [holder('sp-1', 'boss', 'r-lead', true), holder('sp-1', 'peer', 'r-worker', false)],
    });
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))]).toEqual(['peer']);
  });

  it('mixes an overridden space with a defaulted one', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1', { contactUserIds: ['chosen'] }), assignment('sp-2')],
      spaces: [space('sp-1'), space('sp-2')],
      holders: [holder('sp-1', 'boss1', 'r-lead', true), holder('sp-2', 'boss2', 'r-lead', true)],
    });
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))].sort()).toEqual(['boss2', 'chosen']);
  });

  it('reads notify and contact configuration independently', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1', { notifyUserIds: ['on-notify'], contactUserIds: ['on-contact'] })],
      spaces: [space('sp-1')],
      holders: [],
    });
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'notify'))]).toEqual(['on-notify']);
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))]).toEqual(['on-contact']);
  });

  it('contributes nobody for an unconfigured space when the leader default is off', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1')],
      spaces: [space('sp-1')],
      holders: [holder('sp-1', 'boss', 'r-lead', true)],
    });
    // The notify path opts out so an unconfigured space never auto-blasts.
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'notify', false))]).toEqual([]);
  });

  it('costs two round trips, not four', async () => {
    // spaceIdsForUser + the override read were the same rows fetched twice, one
    // after the other; the override holders and the space defaults were two
    // more sequential reads of one table. Pinned so it stays collapsed.
    const { prisma, queries } = make({
      mine: [assignment('sp-1', { contactRoleIds: ['r-worker'] }), assignment('sp-2')],
      spaces: [space('sp-2')],
      holders: [holder('sp-1', 'peer', 'r-worker', false), holder('sp-2', 'boss', 'r-lead', true)],
    });
    await resolveMemberRouting(prisma, ORG, ME, 'contact');
    expect(queries).toEqual(['spaceAssignment', 'companyLocation', 'spaceAssignment']);
  });

  it('reads nothing further when the person belongs to no space', async () => {
    const { prisma, queries } = make();
    await resolveMemberRouting(prisma, ORG, ME, 'contact');
    expect(queries).toEqual(['spaceAssignment']);
  });

  it('ignores holders from another organization', async () => {
    const { prisma } = make({
      mine: [assignment('sp-1')],
      spaces: [space('sp-1')],
      holders: [{ ...holder('sp-1', 'outsider', 'r-lead', true), organizationId: 'org-other' }],
    });
    expect([...(await resolveMemberRouting(prisma, ORG, ME, 'contact'))]).toEqual([]);
  });
});
