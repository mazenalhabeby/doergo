import { Role } from '../types/enums';
import { buildResolvedAccess, accessAllows, type AccessPermissionKey, type ResolvedAccess } from '../types/permissions';

/**
 * A member's ORG-WIDE access, resolved from their database row the way the
 * session resolves it (auth-service `validateToken`) — for a service that holds
 * somebody OTHER than the caller, or a caller whose session it was not handed.
 *
 * Reading one flat column (`User.canManageUsers`) instead answered a different
 * question: it ignored the member's ROLE, so a manager whose authority comes
 * from their role was treated as an ordinary member, and a column left behind
 * after a move to a narrower role kept granting. Same three rules as the
 * session: an ADMIN holds everything by being one; the role counts only while
 * active; the legacy columns count only until ACCESS_IGNORE_LEGACY_FLAGS
 * retires them.
 */
export const ORG_ACCESS_SELECT = {
  role: true,
  canCreateTasks: true,
  canViewAllTasks: true,
  canAssignTasks: true,
  canManageUsers: true,
  canViewReports: true,
  memberRole: { select: { permissions: true, isActive: true } },
} as const;

export interface OrgAccessRow {
  role: string;
  canCreateTasks?: boolean | null;
  canViewAllTasks?: boolean | null;
  canAssignTasks?: boolean | null;
  canManageUsers?: boolean | null;
  canViewReports?: boolean | null;
  memberRole?: { permissions: unknown; isActive: boolean } | null;
}

/** The session's switch, read from the same variable. */
export function legacyFlagsIgnored(env: Record<string, string | undefined> = process.env): boolean {
  return env.ACCESS_IGNORE_LEGACY_FLAGS === 'true';
}

export function orgAccessOf(row: OrgAccessRow, opts: { ignoreLegacyFlags?: boolean } = {}): ResolvedAccess {
  const ignore = opts.ignoreLegacyFlags ?? legacyFlagsIgnored();
  return buildResolvedAccess({
    isAdmin: row.role === Role.ADMIN,
    userFlags: ignore ? undefined : row,
    memberRolePermissions: row.memberRole?.isActive ? row.memberRole.permissions : undefined,
  });
}

/** Does this member hold `key` org-wide? */
export function orgAllows(row: OrgAccessRow, key: AccessPermissionKey, opts?: { ignoreLegacyFlags?: boolean }): boolean {
  return accessAllows(orgAccessOf(row, opts), key);
}
