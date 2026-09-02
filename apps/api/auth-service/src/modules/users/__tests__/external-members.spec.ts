import {
  PERMISSION_KEYS,
  EXTERNAL_ALLOWED_PERMISSIONS,
  externalMayHold,
  externalForbiddenIn,
  permissionLabel,
  BUILTIN_ROLES,
  permissionsFromOrgRole,
  type PermissionSet,
} from '@hbcfield/shared';

/**
 * The ceiling on what an external member may hold.
 *
 * An external member works for a client and holds a login to our tenant, so the
 * interesting property is not which permissions are on the list today — it is
 * that the list is CLOSED. A deny-list would grant every permission added after
 * it was written, silently, to outsiders. These tests pin the closed shape so a
 * future key cannot leak through by being forgotten.
 */
describe('external member permission ceiling', () => {
  describe('the list is closed (fail-closed)', () => {
    it('refuses a permission key that does not exist yet', () => {
      // Stands in for whatever gets added next year.
      expect(externalMayHold('canLaunchMissiles')).toBe(false);
      expect(externalMayHold('')).toBe(false);
    });

    it('refuses every permission not explicitly allowed', () => {
      const allowed = new Set<string>(EXTERNAL_ALLOWED_PERMISSIONS);
      for (const key of PERMISSION_KEYS) {
        expect(externalMayHold(key)).toBe(allowed.has(key));
      }
    });

    it('allows only work and hours — never the organization itself', () => {
      // Named individually rather than derived, so widening the allow-list has
      // to change this test too and cannot happen by accident.
      expect([...EXTERNAL_ALLOWED_PERMISSIONS].sort()).toEqual(
        [
          'canApproveOvertime',
          'canAssignTasks',
          'canCreateTasks',
          'canManageRota',
          'canReconcileAttendance',
          'canViewAllTasks',
          'canViewSpaceAttendance',
        ].sort(),
      );
    });
  });

  describe('the things an outsider must never reach', () => {
    const forbidden = [
      'canManageUsers', // could add their own people
      'canManageWorkspaces', // could delete a site
      'canManagePortals', // could publish to your customers
      'canManageInvoices', // could invoice your customers
      'canViewTracking', // where your staff physically are
      'canViewReports', // org-wide reporting
      'crmViewAll', // your client list is your business
      'crmManageClients',
      'canOpenMemberDocuments', // payslips
      'canIssueDocuments',
    ] as const;

    it.each(forbidden)('refuses %s', (key) => {
      expect(externalMayHold(key)).toBe(false);
      expect(externalForbiddenIn({ [key]: true } as PermissionSet)).toEqual([key]);
    });
  });

  describe('externalForbiddenIn', () => {
    it('passes a clean grant', () => {
      expect(
        externalForbiddenIn({ canApproveOvertime: true, canViewSpaceAttendance: true }),
      ).toEqual([]);
    });

    it('ignores keys set to false — only granted permissions count', () => {
      expect(externalForbiddenIn({ canManageUsers: false, canViewReports: false })).toEqual([]);
    });

    it('tolerates null and undefined', () => {
      expect(externalForbiddenIn(null)).toEqual([]);
      expect(externalForbiddenIn(undefined)).toEqual([]);
    });

    it('names every offender, not just the first', () => {
      const out = externalForbiddenIn({
        canApproveOvertime: true,
        canManageUsers: true,
        canViewTracking: true,
      });
      expect(out.sort()).toEqual(['canManageUsers', 'canViewTracking']);
    });
  });

  describe('against the built-in roles an admin actually picks', () => {
    const roleBySlug = (slug: string) => BUILTIN_ROLES.find((r) => r.slug === slug)!;

    it.each(['shift-leader', 'team-leader'])(
      '%s may be given to an external member — it is the job',
      (slug) => {
        const perms = permissionsFromOrgRole(roleBySlug(slug).permissions as PermissionSet);
        expect(externalForbiddenIn(perms)).toEqual([]);
      },
    );

    it('External Supervisor may — the role that exists for exactly this', () => {
      const perms = permissionsFromOrgRole(
        roleBySlug('external-supervisor').permissions as PermissionSet,
      );
      expect(externalForbiddenIn(perms)).toEqual([]);
    });

    it('External Supervisor is space-scoped — an org role would reach every space', () => {
      expect(roleBySlug('external-supervisor').scope).toBe('SPACE');
    });

    it('External Supervisor sees the work as well as the hours', () => {
      // The one permission separating it from Shift Leader. If this ever stops
      // being true the role is a duplicate and should be deleted, not kept.
      const ext = roleBySlug('external-supervisor').permissions as PermissionSet;
      const shift = roleBySlug('shift-leader').permissions as PermissionSet;
      expect(ext.canViewAllTasks).toBe(true);
      expect(shift.canViewAllTasks).toBeUndefined();
    });

    it('Space Manager may NOT — it carries canManageUsers for the space', () => {
      const perms = permissionsFromOrgRole(roleBySlug('space-manager').permissions as PermissionSet);
      expect(externalForbiddenIn(perms)).toContain('canManageUsers');
    });

    it.each(['admin', 'manager'])('%s may NOT — org-wide by definition', (slug) => {
      const perms = permissionsFromOrgRole(roleBySlug(slug).permissions as PermissionSet);
      expect(externalForbiddenIn(perms).length).toBeGreaterThan(0);
    });
  });

  describe('refusals name the permission the way the checkbox does', () => {
    it('resolves a real key to its schema label', () => {
      expect(permissionLabel('canManageUsers')).not.toBe('canManageUsers');
      expect(permissionLabel('canManageUsers').length).toBeGreaterThan(0);
    });

    it('falls back to the key rather than throwing on an unknown one', () => {
      expect(permissionLabel('nope')).toBe('nope');
    });
  });
});
