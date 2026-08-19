import { buildResolvedAccess, accessAllows } from '@hbcfield/shared';

/**
 * The permission fields a member's session carries must come from resolved
 * access, never from the raw columns.
 *
 * About seventy-five places downstream read `req.user.canViewAllTasks` and
 * friends — the gateway forwarding them to a service, the service deciding with
 * them. While they were the raw columns and the guards beside them used the
 * role, the two could disagree: a guard refusing what a service allowed. These
 * pin the restatement that closes that gap.
 */
describe('session permission fields are derived from access', () => {
  /** Exactly what auth.service does at the boundary. */
  const orgPermissionFields = (access: ReturnType<typeof buildResolvedAccess>) => ({
    canCreateTasks: accessAllows(access, 'canCreateTasks'),
    canViewAllTasks: accessAllows(access, 'canViewAllTasks'),
    canAssignTasks: accessAllows(access, 'canAssignTasks'),
    canManageUsers: accessAllows(access, 'canManageUsers'),
    canViewReports: accessAllows(access, 'canViewReports'),
  });

  it('reports what the role grants', () => {
    const access = buildResolvedAccess({
      memberRolePermissions: { canCreateTasks: true, canViewAllTasks: true },
    });
    expect(orgPermissionFields(access)).toMatchObject({
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: false,
    });
  });

  it('reports false — not undefined — for what nothing grants', () => {
    // Downstream code does `if (canViewAllTasks)`, and an absent key would read
    // the same as false; being explicit keeps the payload honest.
    const fields = orgPermissionFields(buildResolvedAccess({}));
    for (const v of Object.values(fields)) expect(v).toBe(false);
  });

  it('does NOT report a permission held only in one space', () => {
    // A column on the user row never meant "in this space". A space grant is
    // checked against the resource's own spaceId; surfacing it here would let
    // a permission held in space A authorize an action in space B.
    const access = buildResolvedAccess({
      spaces: [{ spaceId: 'space-1', permissions: { canCreateTasks: true } }],
    });
    expect(orgPermissionFields(access).canCreateTasks).toBe(false);
    // …but it is still there for a space-scoped check.
    expect(accessAllows(access, 'canCreateTasks', 'space-1')).toBe(true);
  });

  it('still reports a legacy flag while the switch is off', () => {
    // Before ACCESS_IGNORE_LEGACY_FLAGS is set, the flags are part of access,
    // so the restatement is a no-op rather than a removal.
    const access = buildResolvedAccess({ userFlags: { canManageUsers: true } });
    expect(orgPermissionFields(access).canManageUsers).toBe(true);
  });

  it('drops the flag once the switch is on and the role does not grant it', () => {
    // The same member, resolved with the flags omitted — which is what the
    // backfill exists to make safe.
    const access = buildResolvedAccess({ memberRolePermissions: { canViewAllTasks: true } });
    expect(orgPermissionFields(access).canManageUsers).toBe(false);
    expect(orgPermissionFields(access).canViewAllTasks).toBe(true);
  });
});
