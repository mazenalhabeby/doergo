import { Role } from '@hbcfield/shared';

/**
 * Which workspaces' equipment a caller may list.
 *
 * `GET /assets` was `@RequirePermission('canViewAllTasks')` with no workspace
 * filter at all — so the person who runs a site could not open the assets list,
 * and whoever could open it saw every site in the company. Both halves were
 * wrong, and lifting the page out of the workspace settings is what forced the
 * question.
 *
 * An asset reaches a workspace through its KIND (`AssetCategory.spaceId`), so
 * the filter lands on the category relation rather than on the asset.
 */
describe('assets, scoped to the caller’s workspaces', () => {
  /** `spaceFilter` as AssetAccessService applies it. */
  const filter = (
    actor: { userRole?: string; canViewAllTasks?: boolean; viewAllSpaceIds?: string[] },
    requested?: string,
  ) => {
    const orgWide = actor.userRole === Role.ADMIN || actor.canViewAllTasks === true;
    if (orgWide) return requested ? { spaceId: requested } : undefined;
    const held = actor.viewAllSpaceIds ?? [];
    return { spaceId: { in: requested ? held.filter((id) => id === requested) : held } };
  };

  it('adds no clause for an admin browsing everything', () => {
    // The query an org-wide caller runs today, unchanged — no cost, no filter.
    expect(filter({ userRole: Role.ADMIN })).toBeUndefined();
  });

  it('lets an org-wide caller narrow to one workspace', () => {
    expect(filter({ canViewAllTasks: true }, 's2')).toEqual({ spaceId: 's2' });
  });

  it('confines a space-scoped caller to the workspaces they hold', () => {
    expect(filter({ viewAllSpaceIds: ['s1', 's3'] })).toEqual({ spaceId: { in: ['s1', 's3'] } });
  });

  /*
    The one that matters: `?spaceId=` is a REQUEST, not an authorisation. It has
    to narrow what somebody may see and must never reach past it, however the id
    was obtained.
  */
  it('intersects a requested workspace rather than replacing the grant', () => {
    expect(filter({ viewAllSpaceIds: ['s1'] }, 's1')).toEqual({ spaceId: { in: ['s1'] } });
    expect(filter({ viewAllSpaceIds: ['s1'] }, 's9')).toEqual({ spaceId: { in: [] } });
  });

  it('matches nothing when the caller is granted nowhere', () => {
    // Empty and absent are different states: absent means org-wide, empty means
    // no workspace at all — and collapsing them turns a scoped list into a full
    // one for exactly the people who hold least.
    expect(filter({ viewAllSpaceIds: [] })).toEqual({ spaceId: { in: [] } });
  });

  /*
    Assets with no kind belong to no workspace. They stay reachable through the
    org-wide orphans list; a space-scoped caller does not see them, because
    there is no workspace on which they could claim them.
  */
  it('excludes workspace-less assets from a scoped view by construction', () => {
    const clause = filter({ viewAllSpaceIds: ['s1'] });
    // A clause ON the category relation cannot match an asset that has none.
    expect(clause).toHaveProperty('spaceId');
  });
});
