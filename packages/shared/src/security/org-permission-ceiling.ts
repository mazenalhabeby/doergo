import { Role } from '../types/enums';
import { type PermissionSet } from '../types/permissions';
import { ORG_ACCESS_SELECT, memberAccessOf, type OrgAccessRow } from '../access/org-access';

import { activeWindowWhere } from '../access/assignment-window';
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
  /**
   * What the member holds org-wide — exactly what their session resolves
   * (memberAccessOf). It used to merge the legacy columns itself, ALWAYS, so
   * with ACCESS_IGNORE_LEGACY_FLAGS on (production) a stale column raised the
   * ceiling above the member's real access: they could grant what they did not
   * hold.
   */
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
    select: ORG_ACCESS_SELECT,
  })) as OrgAccessRow | null;
  if (!row) return null;
  const perms = memberAccessOf(row).org;
  return { role: row.role, isAdmin: row.role === Role.ADMIN, perms };
}

/**
 * What a member may hand out IN ONE WORKSPACE: their org-wide ceiling plus
 * whatever their own assignment there grants — the same union the gateway's
 * `actorPermsForSpace` reads off a session, loaded here for a door that has no
 * session in hand (an invitation, checked when it is made and again when it is
 * accepted, possibly weeks later and after the inviter's access changed).
 *
 * Only an assignment in force now counts, the window sign-in uses.
 */
export async function loadSpacePermissionCeiling(
  prisma: OrgCeilingPrisma,
  userId: string,
  organizationId: string,
  spaceId: string,
): Promise<OrgPermissionCeiling | null> {
  const now = new Date();
  const row = (await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: {
      ...ORG_ACCESS_SELECT,
      spaceAssignments: {
        where: {
          spaceId,
          ...activeWindowWhere(now),
        },
        select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
      },
    },
  })) as OrgAccessRow | null;
  if (!row) return null;
  const access = memberAccessOf(row);
  return { role: row.role, isAdmin: row.role === Role.ADMIN, perms: { ...access.org, ...(access.perSpace[spaceId] ?? {}) } };
}
