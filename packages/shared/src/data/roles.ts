/**
 * Published reads of auth-service's role and watcher tables (`AccessRole`, `NotificationWatch`, and `User`
 * as a role HOLDER) — see db.ts. Owner: auth-service. A personal role never appears in a list.
 */
import { activeWindowWhere } from '../access/assignment-window';
import type { On } from './db';

/** Role names by id. */
export function roleNames(db: On<'accessRole', 'findMany'>, ids: string[]) {
  return db.accessRole.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
}

/** One role's name ('' = no such role). */
export async function roleNameOf(db: On<'accessRole', 'findUnique'>, roleId: string): Promise<string> {
  return (await db.accessRole.findUnique({ where: { id: roleId }, select: { name: true } }))?.name ?? '';
}

/** A SHARED role of the organization (never somebody's personal one) — `{ id }` or null. */
export function sharedRoleInOrg(db: On<'accessRole', 'findFirst'>, roleId: string, organizationId: string) {
  return db.accessRole.findFirst({ where: { id: roleId, organizationId, personalAssignmentId: null }, select: { id: true } });
}

/** Does this active member hold this (active) role organization-wide? `{ id }` or null. */
export function holdsOrgRole(db: On<'user', 'findFirst'>, userId: string, organizationId: string, roleId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId, isActive: true, memberRoleId: roleId, memberRole: { isActive: true } },
    select: { id: true },
  });
}

/**
 * Up to 50 active members holding this role — organization-wide, or as a workspace role in one of these
 * workspaces today — except the given ids.
 */
export async function roleHolderIds(
  db: On<'user', 'findMany'>,
  input: { organizationId: string; roleId: string; spaceIds: string[]; exclude: string[]; now: Date },
): Promise<string[]> {
  const { organizationId, roleId, spaceIds, exclude, now } = input;
  const holders = await db.user.findMany({
    where: {
      organizationId,
      isActive: true,
      id: { notIn: exclude },
      OR: [
        { memberRoleId: roleId, memberRole: { isActive: true } },
        ...(spaceIds.length
          ? [{ spaceAssignments: { some: { roleId, spaceId: { in: spaceIds }, role: { isActive: true }, ...activeWindowWhere(now) } } }]
          : []),
      ],
    },
    select: { id: true },
    take: 50,
  });
  return holders.map((h) => h.id);
}

/** The organization's active internal administrators (oldest first, ≤ 50), except one person. */
export function orgAdminIds(db: On<'user', 'findMany'>, organizationId: string, exceptUserId: string) {
  return db.user.findMany({
    where: { organizationId, role: 'ADMIN', isActive: true, isExternal: false, id: { not: exceptUserId } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
}

/** Who watches a member (for routing), with what a delivery needs. */
export function watchersOf(db: On<'notificationWatch', 'findMany'>, subjectUserId: string, organizationId: string) {
  return db.notificationWatch.findMany({
    where: { subjectUserId, organizationId },
    select: { watcher: { select: { id: true, email: true, isActive: true, notificationPrefs: true } } },
  });
}

/** Active people's address and switches — what a delivery needs. */
export function peopleToNotify(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, email: true, notificationPrefs: true } });
}
