import {
  targetRolePermissions,
  roleAlreadyCoversFlags,
  permissionSignature,
  wouldLosePermissions,
} from '@hbcfield/shared';

/**
 * The safety property of retiring the per-member flags: nobody loses anything.
 *
 * These describe the decisions the backfill makes before the resolver stops
 * reading the flags. If any of them is wrong, the failure mode is a person
 * quietly losing a capability they had yesterday — which is exactly the kind of
 * thing that is noticed weeks later by someone who cannot do their job.
 */
describe('retiring the per-member permission flags', () => {
  const NONE = {};

  describe('roleAlreadyCoversFlags', () => {
    it('is true when the role already grants everything the flags do', () => {
      expect(roleAlreadyCoversFlags({ canCreateTasks: true }, { canCreateTasks: true, canAssignTasks: true })).toBe(true);
    });

    it('is true when the flags grant nothing — the common case', () => {
      expect(roleAlreadyCoversFlags(NONE, { canViewAllTasks: true })).toBe(true);
      expect(roleAlreadyCoversFlags(NONE, NONE)).toBe(true);
    });

    it('is false when a flag grants something the role does not', () => {
      // This person would lose task creation if the flags simply stopped being read.
      expect(roleAlreadyCoversFlags({ canCreateTasks: true }, { canViewAllTasks: true })).toBe(false);
    });

    it('is false when the user has no role at all but does have flags', () => {
      expect(roleAlreadyCoversFlags({ canManageUsers: true }, null)).toBe(false);
    });
  });

  describe('targetRolePermissions', () => {
    it('is the union — the point is to lose nothing', () => {
      expect(targetRolePermissions({ canCreateTasks: true }, { canViewAllTasks: true })).toEqual({
        canCreateTasks: true,
        canViewAllTasks: true,
      });
    });

    it('never invents a permission neither side granted', () => {
      const out = targetRolePermissions({ canCreateTasks: true }, NONE);
      expect(out).toEqual({ canCreateTasks: true });
      expect(out.canManageUsers).toBeUndefined();
    });

    it('ignores keys outside the permission vocabulary', () => {
      const tampered = { canCreateTasks: true, isSuperUser: true } as never;
      expect(targetRolePermissions(tampered, NONE)).toEqual({ canCreateTasks: true });
    });

    it('treats a false flag as absent, not as a denial', () => {
      // Nothing in this system records a denial; false simply grants nothing.
      expect(targetRolePermissions({ canCreateTasks: false } as never, { canViewAllTasks: true })).toEqual({
        canViewAllTasks: true,
      });
    });
  });

  describe('permissionSignature', () => {
    it('gives one identity to one set of grants, whatever the key order', () => {
      const a = permissionSignature({ canViewAllTasks: true, canCreateTasks: true });
      const b = permissionSignature({ canCreateTasks: true, canViewAllTasks: true });
      expect(a).toBe(b);
    });

    it('separates different grants, so two users do not share a wrong role', () => {
      expect(permissionSignature({ canCreateTasks: true }))
        .not.toBe(permissionSignature({ canCreateTasks: true, canAssignTasks: true }));
    });

    it('names the empty set rather than returning an empty string', () => {
      expect(permissionSignature(NONE)).toBe('none');
      expect(permissionSignature(null)).toBe('none');
    });
  });

  describe('wouldLosePermissions — the gate before the switch is flipped', () => {
    it('reports nothing once the role covers the flags', () => {
      expect(wouldLosePermissions({ canCreateTasks: true }, { canCreateTasks: true })).toEqual([]);
    });

    it('names exactly what would be lost, sorted', () => {
      expect(
        wouldLosePermissions(
          { canCreateTasks: true, canManageUsers: true, canViewAllTasks: true },
          { canViewAllTasks: true },
        ),
      ).toEqual(['canCreateTasks', 'canManageUsers']);
    });

    it('reports nothing for a user who never had flags', () => {
      expect(wouldLosePermissions(NONE, NONE)).toEqual([]);
    });
  });
});
