import { Role } from '../types/enums';
import {
  buildResolvedAccess,
  accessAllows,
  type AccessPermissionKey,
  type ResolvedAccess,
  type SharedSpaceGrant,
} from '../types/permissions';

/**
 * A member's access, resolved from their database row — THE way, for every
 * door: sign-in, refresh, token validation, the session builder, the socket
 * gateway, and any service that holds somebody OTHER than the caller.
 *
 * ⚠️ Those doors each carried a copy of this mapping (five), and one had
 * drifted — a document-reviewer lookup ignored an inactive role and the
 * legacy-flag switch, so a member whose role was switched off could still be
 * chosen to review. Sign-in and the next request must agree, or a member is
 * handed permissions that vanish on their very next click.
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
  /** Space roles; omit for an org-wide-only question. A role grants nothing while inactive. */
  spaceAssignments?: Array<{ spaceId: string; role?: { permissions: unknown; isActive: boolean } | null }>;
}

/** The session's switch, read from the same variable. */
export function legacyFlagsIgnored(env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): boolean {
  return env.ACCESS_IGNORE_LEGACY_FLAGS === 'true';
}

export function memberAccessOf(
  row: OrgAccessRow,
  opts: { ignoreLegacyFlags?: boolean; sharedSpaces?: SharedSpaceGrant[] } = {},
): ResolvedAccess {
  const ignore = opts.ignoreLegacyFlags ?? legacyFlagsIgnored();
  return buildResolvedAccess({
    isAdmin: row.role === Role.ADMIN,
    userFlags: ignore ? undefined : row,
    memberRolePermissions: row.memberRole?.isActive ? row.memberRole.permissions : undefined,
    spaces: (row.spaceAssignments ?? []).map((a) => ({
      spaceId: a.spaceId,
      permissions: a.role?.isActive ? a.role.permissions : undefined,
    })),
    sharedSpaces: opts.sharedSpaces,
  });
}

/** Does this member hold `key` org-wide? */
export function orgAllows(row: OrgAccessRow, key: AccessPermissionKey, opts?: { ignoreLegacyFlags?: boolean }): boolean {
  return accessAllows(memberAccessOf(row, opts), key);
}
