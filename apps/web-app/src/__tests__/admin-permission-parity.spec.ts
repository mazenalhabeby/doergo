/**
 * The client's permission gate must agree with the server's.
 *
 * `PermissionsGuard` lets an ADMIN through without consulting any flag. The web
 * app's `hasPermission` did not, and the gap is not theoretical: a built-in
 * role's `permissions` JSON is a SNAPSHOT written when the row was seeded and
 * never gains keys added afterwards. The seeded `admin` role in this project's
 * database carries nine of the twenty-four keys in the catalogue.
 *
 * So an admin's `access.org` genuinely lacks most permissions, and a UI that
 * trusted it would hide controls the API accepts — which reads as a broken
 * screen rather than as a permission decision.
 */
import { PERMISSION_KEYS, isAdmin } from '@hbcfield/shared/client';

/**
 * The client-side rule, extracted verbatim from auth-context's hasPermission.
 * Kept in step by the source assertion at the bottom of this file.
 */
function hasPermission(user: any, perm: string): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if ((user as Record<string, unknown>)[perm] === true) return true;
  return user.access?.org?.[perm] === true;
}

/** What PermissionsGuard does on the server, for comparison. */
function serverAllows(user: any, perm: string): boolean {
  if (!user) return true; // guard returns true when there is no user
  if (isAdmin(user)) return true;
  return user[perm] === true;
}

describe('admin permission parity', () => {
  /*
    A realistic stale admin: the role they hold was seeded before half the
    catalogue existed, so `access.org` is a nine-key subset.
  */
  const staleAdmin = {
    id: 'a1',
    role: 'ADMIN',
    access: {
      org: {
        canCreateTasks: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
        canViewReports: true,
        canManageRota: true,
        canApproveOvertime: true,
        canReconcileAttendance: true,
        canViewSpaceAttendance: true,
      },
    },
  };

  it('grants an admin every catalogued permission, however stale their role row', () => {
    for (const key of PERMISSION_KEYS) {
      expect(hasPermission(staleAdmin, key)).toBe(true);
    }
  });

  it('agrees with the server on every key, for an admin', () => {
    for (const key of PERMISSION_KEYS) {
      expect(hasPermission(staleAdmin, key)).toBe(serverAllows(staleAdmin, key));
    }
  });

  it('covers the four document permissions specifically', () => {
    // The ones that prompted this: with no bridge in orgPermissionFields, a
    // stale admin's flat fields are all false, so only the bypass saves them.
    for (const key of [
      'canViewMemberDocuments',
      'canOpenMemberDocuments',
      'canIssueDocuments',
      'canManageDocumentTemplates',
    ]) {
      expect(hasPermission(staleAdmin, key)).toBe(true);
    }
  });

  it('still refuses a non-admin who was not granted the key', () => {
    // The bypass must not become a general amnesty. A manager holds
    // canManageUsers and must NOT thereby be able to open a payslip.
    const manager = {
      id: 'm1',
      role: 'EMPLOYEE',
      canManageUsers: true,
      access: { org: { canManageUsers: true, canViewAllTasks: true } },
    };
    expect(hasPermission(manager, 'canManageUsers')).toBe(true);
    expect(hasPermission(manager, 'canOpenMemberDocuments')).toBe(false);
    expect(hasPermission(manager, 'canIssueDocuments')).toBe(false);
  });

  it('grants a non-admin a key their role does carry', () => {
    const bookkeeper = {
      id: 'b1',
      role: 'EMPLOYEE',
      access: { org: { canIssueDocuments: true } },
    };
    expect(hasPermission(bookkeeper, 'canIssueDocuments')).toBe(true);
    expect(hasPermission(bookkeeper, 'canOpenMemberDocuments')).toBe(false);
  });

  it('treats the legacy CLIENT role as admin, as the server does', () => {
    expect(hasPermission({ id: 'c', role: 'CLIENT', access: { org: {} } }, 'canIssueDocuments')).toBe(true);
  });

  it('refuses everything when there is no user', () => {
    for (const key of PERMISSION_KEYS) {
      expect(hasPermission(null, key)).toBe(false);
    }
  });
});

describe('the rule above is the rule that ships', () => {
  it('auth-context still short-circuits on isAdmin', () => {
    // This file reimplements hasPermission to test it in isolation. If the real
    // one loses the bypass, the copy here would keep passing and prove nothing.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/contexts/auth-context.tsx'),
      'utf8',
    );
    expect(src).toContain('if (isAdmin(user)) return true;');
  });
});
