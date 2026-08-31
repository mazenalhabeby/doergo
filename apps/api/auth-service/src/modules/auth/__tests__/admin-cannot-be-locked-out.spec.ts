import { buildResolvedAccess, accessAllows, PERMISSION_KEYS } from '@hbcfield/shared';

/**
 * An admin holds everything by being an admin.
 *
 * This is a regression test for a real production lockout. Production runs with
 * ACCESS_IGNORE_LEGACY_FLAGS=true, so a member's permissions come from their
 * assigned role alone. An admin's role was then saved with an empty permission
 * set — and the organization's owner resolved to nobody, in their own
 * organization: the entire admin navigation vanished, Organization Settings
 * included, and there was no route back through the product. It took a direct
 * database update to restore it.
 *
 * The product had already made the promise out loud. The member's Access tab
 * says "Admins have every permission and module across the whole organization."
 * The resolver did not implement it, and a tier the UI describes as absolute has
 * to be absolute in the resolver or it is a promise the code does not keep.
 */
describe('an admin cannot be locked out by their role', () => {
  it('grants every permission when the role is EMPTY', () => {
    // The exact shape that caused the outage: `permissions: {}`.
    const access = buildResolvedAccess({ isAdmin: true, memberRolePermissions: {} });
    for (const key of PERMISSION_KEYS) {
      expect(accessAllows(access, key)).toBe(true);
    }
  });

  it('grants every permission when there is NO role at all', () => {
    // memberRoleId null — the state six members in the reference org are in.
    const access = buildResolvedAccess({ isAdmin: true });
    expect(accessAllows(access, 'canManageUsers')).toBe(true);
    expect(accessAllows(access, 'canViewAllTasks')).toBe(true);
  });

  it('grants every permission with the legacy flags ignored', () => {
    /*
      The production configuration. With the columns out of the picture there is
      nothing left but the role, which is exactly why an empty role was fatal.
    */
    const access = buildResolvedAccess({
      isAdmin: true,
      userFlags: undefined,
      memberRolePermissions: { canCreateTasks: true },
    });
    expect(accessAllows(access, 'canManageUsers')).toBe(true);
  });

  it('does not widen a non-admin', () => {
    // The guarantee only attaches to the tier. A member with a thin role keeps
    // exactly that role, which is the whole point of roles.
    const access = buildResolvedAccess({
      isAdmin: false,
      memberRolePermissions: { canCreateTasks: true },
    });
    expect(accessAllows(access, 'canCreateTasks')).toBe(true);
    expect(accessAllows(access, 'canManageUsers')).toBe(false);
  });

  it('leaves an empty non-admin empty', () => {
    const access = buildResolvedAccess({ memberRolePermissions: {} });
    for (const key of PERMISSION_KEYS) {
      expect(accessAllows(access, key)).toBe(false);
    }
  });

  it('does not grant an admin permissions inside somebody else’s space', () => {
    /*
      The tier is ORG-wide, and this must not quietly become "admins can do
      anything anywhere", which would include foreign spaces reached by a
      cross-org share. Those are governed by the share level, not by the tier.
    */
    const access = buildResolvedAccess({ isAdmin: true });
    expect(access.perSpace).toEqual({});
  });
});
