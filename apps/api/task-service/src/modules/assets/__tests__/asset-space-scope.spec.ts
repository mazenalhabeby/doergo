import { Role } from '@hbcfield/shared';
import { AssetAccessService } from '../core/asset-access.service';

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
 *
 * Reached through the class, never a copy of the rule: a test that rewrites the
 * rule it is testing passes whatever the code does (this one used to).
 */
describe('assets, scoped to the caller’s workspaces', () => {
  const svc = new AssetAccessService({} as never);
  const filter = (actor: Record<string, unknown>, requested?: string) =>
    svc.spaceFilter({ userId: 'u', organizationId: 'o', userRole: 'EMPLOYEE', ...actor } as any, 'view', requested);

  it('adds no clause for an admin browsing everything', () => {
    // The query an org-wide caller runs today, unchanged — no cost, no filter.
    expect(filter({ userRole: Role.ADMIN })).toBeUndefined();
  });

  it('lets an org-wide caller narrow to one workspace', () => {
    expect(filter({ viewSpaceIds: null }, 's2')).toEqual({ spaceId: 's2' });
  });

  it('confines a space-scoped caller to the workspaces they hold', () => {
    expect(filter({ viewSpaceIds: ['s1', 's3'] })).toEqual({ spaceId: { in: ['s1', 's3'] } });
  });

  /*
    The one that matters: `?spaceId=` is a REQUEST, not an authorisation. It has
    to narrow what somebody may see and must never reach past it, however the id
    was obtained.
  */
  it('intersects a requested workspace rather than replacing the grant', () => {
    expect(filter({ viewSpaceIds: ['s1'] }, 's1')).toEqual({ spaceId: { in: ['s1'] } });
    expect(filter({ viewSpaceIds: ['s1'] }, 's9')).toEqual({ spaceId: { in: [] } });
  });

  it('matches nothing when the caller is granted nowhere', () => {
    // Empty and org-wide are different states — and collapsing them turns a
    // scoped list into a full one for exactly the people who hold least.
    expect(filter({ viewSpaceIds: [] })).toEqual({ spaceId: { in: [] } });
  });

  /*
    ⚠️ ABSENT is nowhere too. A caller that forgot to forward its workspaces —
    a new route, a hand-built queue job — must lose the register, not gain it.
    And the task grant that used to open it opens nothing.
  */
  it('reads a missing scope as nowhere, and ignores canViewAllTasks', () => {
    expect(filter({})).toEqual({ spaceId: { in: [] } });
    expect(filter({ canViewAllTasks: true })).toEqual({ spaceId: { in: [] } });
  });

  /*
    Assets with no kind belong to no workspace. They stay reachable through the
    org-wide orphans list; a space-scoped caller does not see them, because
    there is no workspace on which they could claim them.
  */
  it('excludes workspace-less assets from a scoped view by construction', () => {
    const clause = filter({ viewSpaceIds: ['s1'] });
    // A clause ON the category relation cannot match an asset that has none.
    expect(clause).toHaveProperty('spaceId');
    expect(svc.mayIn({ userRole: 'EMPLOYEE', viewSpaceIds: ['s1'] } as any, 'view', null)).toBe(false);
    expect(svc.mayIn({ userRole: 'EMPLOYEE', viewSpaceIds: null } as any, 'view', null)).toBe(true);
  });
});
