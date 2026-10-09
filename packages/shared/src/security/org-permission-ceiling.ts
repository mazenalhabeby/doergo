import { Role } from '../types/enums';
import {
  mergePermissions,
  permissionsFromOrgRole,
  permissionsFromUserFlags,
  type PermissionSet,
} from '../types/permissions';

/**
 * The narrow slice of a Prisma client this needs — structural, so the shared
 * package does not depend on any one service's generated client.
 */
export interface OrgCeilingPrisma {
  user: {
    findFirst(args: {
      where: { id: string; organizationId: string };
      select: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

export interface OrgPermissionCeiling {
  role: string;
  isAdmin: boolean;
  /** Legacy user flags ∪ the ACTIVE org role — the member's org-wide ceiling. */
  perms: PermissionSet;
}

/**
 * A member's org-wide permission ceiling, read the way every grant check reads
 * it: the legacy flags on the user row, merged with their org role while that
 * role is active. `null` when the person is not in this organization.
 *
 * One loader for every "may X grant Y?" door (member edits, password resets,
 * join-request approval, invitations) — the copies of this select are how one
 * door came to forget the role and judge a manager by their legacy flags alone.
 */
export async function loadOrgPermissionCeiling(
  prisma: OrgCeilingPrisma,
  userId: string,
  organizationId: string,
): Promise<OrgPermissionCeiling | null> {
  const row = (await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: {
      role: true,
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
      canViewReports: true,
      memberRole: { select: { permissions: true, isActive: true } },
    },
  })) as
    | {
        role: string;
        canCreateTasks?: boolean | null;
        canViewAllTasks?: boolean | null;
        canAssignTasks?: boolean | null;
        canManageUsers?: boolean | null;
        canViewReports?: boolean | null;
        memberRole?: { permissions: unknown; isActive: boolean } | null;
      }
    | null;
  if (!row) return null;
  const perms = mergePermissions(
    permissionsFromUserFlags(row),
    row.memberRole?.isActive ? permissionsFromOrgRole(row.memberRole.permissions) : undefined,
  );
  return { role: row.role, isAdmin: row.role === Role.ADMIN, perms };
}
