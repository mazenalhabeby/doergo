/**
 * Published reads of auth-service's role and watcher tables (`AccessRole`, `NotificationWatch`, and `User`
 * as a role HOLDER) — see db.ts. Owner: auth-service. A personal role never appears in a list.
 */
import { activeWindowWhere } from '../access/assignment-window';
import { SHARED_ROLE_WHERE } from '../access/personal-role';
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
  return db.accessRole.findFirst({
    where: { id: roleId, organizationId, personalAssignmentId: null },
    select: { id: true },
  });
}

/** Does this active member hold this (active) role organization-wide? `{ id }` or null. */
export function holdsOrgRole(db: On<'user', 'findFirst'>, userId: string, organizationId: string, roleId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId, isActive: true, memberRoleId: roleId, memberRole: { isActive: true } },
    select: { id: true },
  });
}

/**
 * Which of these roles an active member holds — organization-wide, or as a workspace role in one of these
 * workspaces today (an active role, an assignment in its window). One query; the order of `roleIds` is kept.
 */
export async function heldRoleIds(
  db: On<'user', 'findFirst'>,
  input: { userId: string; organizationId: string; roleIds: string[]; spaceIds: string[]; now: Date },
): Promise<string[]> {
  const { userId, organizationId, roleIds, spaceIds, now } = input;
  if (!roleIds.length) return [];
  const user = await db.user.findFirst({
    where: { id: userId, organizationId, isActive: true },
    select: {
      memberRoleId: true,
      memberRole: { select: { isActive: true } },
      spaceAssignments: {
        where: {
          roleId: { in: roleIds },
          spaceId: { in: spaceIds },
          role: { isActive: true },
          ...activeWindowWhere(now),
        },
        select: { roleId: true },
      },
    },
  });
  if (!user) return [];
  const held = new Set((user.spaceAssignments ?? []).map((a) => a.roleId));
  if (user.memberRoleId && user.memberRole?.isActive) held.add(user.memberRoleId);
  return roleIds.filter((id) => held.has(id));
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
          ? [
              {
                spaceAssignments: {
                  some: { roleId, spaceId: { in: spaceIds }, role: { isActive: true }, ...activeWindowWhere(now) },
                },
              },
            ]
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
  return db.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, email: true, notificationPrefs: true },
  });
}

/** An active member as an overtime decision needs them: their role and their org role's permissions. */
export function approverFacts(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId, isActive: true },
    select: { id: true, role: true, memberRole: { select: { permissions: true } } },
  });
}

/* ── Workspace roles, as task-service's role screens read them (auth writes them, group D) ── */

const SPACE_SCOPE = { scope: { in: ['SPACE', 'BOTH'] as ('SPACE' | 'BOTH')[] } };
/** Never a personal role in a list (one person's permissions in one workspace). */
const SHARED = SHARED_ROLE_WHERE;

/** The organization's shared workspace roles, in order, with how many hold each. */
export function spaceRolesWithCounts(db: On<'accessRole', 'findMany'>, organizationId: string) {
  return db.accessRole.findMany({
    where: { organizationId, ...SPACE_SCOPE, ...SHARED },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { spaceAssignments: true, workAssignments: true } } },
  });
}

/** The same list in the columns one workspace's role screen shows. */
export function spaceRoleCards(db: On<'accessRole', 'findMany'>, organizationId: string) {
  return db.accessRole.findMany({
    where: { organizationId, ...SPACE_SCOPE, ...SHARED },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      description: true,
      permissions: true,
      kind: true,
      isSystem: true,
      isActive: true,
      scope: true,
      _count: { select: { spaceAssignments: true, workAssignments: true } },
    },
  });
}

/** The highest role position in the organization. */
export function maxRolePosition(db: On<'accessRole', 'aggregate'>, organizationId: string) {
  return db.accessRole.aggregate({ where: { organizationId }, _max: { position: true } });
}

/** How many of these roles are SHARED roles of the organization. */
export function countSharedRolesInOrg(db: On<'accessRole', 'count'>, ids: string[], organizationId: string) {
  return db.accessRole.count({ where: { id: { in: ids }, organizationId, ...SHARED } });
}

/** A shared workspace role already named this (case-insensitive), other than `excludeId`. */
export function spaceRoleNamed(
  db: On<'accessRole', 'findFirst'>,
  organizationId: string,
  name: string,
  excludeId?: string,
) {
  return db.accessRole.findFirst({
    where: {
      organizationId,
      ...SPACE_SCOPE,
      ...SHARED,
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
}

/** One workspace role of the organization (the whole row — the screen edits it). */
export function spaceRoleInOrg(db: On<'accessRole', 'findFirst'>, roleId: string, organizationId: string) {
  return db.accessRole.findFirst({ where: { id: roleId, organizationId, ...SPACE_SCOPE } });
}

/** Slugs of the organization's roles starting with `base` (personal ones included — slugs are unique). */
export function roleSlugsLike(
  db: On<'accessRole', 'findMany'>,
  organizationId: string,
  base: string,
  excludeId?: string,
) {
  return db.accessRole.findMany({
    where: { organizationId, slug: { startsWith: base }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { slug: true },
  });
}

/** The organization's active org-level roles (not workspace-only) with their permissions. */
export function orgRoleGrants(db: On<'accessRole', 'findMany'>, organizationId: string) {
  return db.accessRole.findMany({
    where: { organizationId, isActive: true, scope: { not: 'SPACE' as never } },
    select: { id: true, permissions: true },
  });
}

/**
 * Up to 25 active internal people who can act organization-wide: administrators, people managers, or
 * holders of one of these org roles — except one person.
 */
export async function orgWideActorIds(
  db: On<'user', 'findMany'>,
  input: { organizationId: string; grantingRoleIds: string[]; exceptUserId?: string },
): Promise<string[]> {
  const people = await db.user.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      isExternal: false,
      ...(input.exceptUserId ? { id: { not: input.exceptUserId } } : {}),
      OR: [
        { role: 'ADMIN' as never },
        { canManageUsers: true },
        ...(input.grantingRoleIds.length ? [{ memberRoleId: { in: input.grantingRoleIds } }] : []),
      ],
    },
    select: { id: true },
    take: 25,
  });
  return people.map((p) => p.id);
}

/** Active internal people's role, legacy flags and org role permissions — who may see / act on a record. */
export function staffAccessFlags(db: On<'user', 'findMany'>, ids: string[], organizationId: string) {
  return db.user.findMany({
    where: { id: { in: ids }, organizationId, isActive: true, isExternal: false },
    select: {
      id: true,
      role: true,
      canViewAllTasks: true,
      canManageUsers: true,
      memberRole: { select: { permissions: true, isActive: true } },
    },
  });
}

/** A WORK role of the organization: `{ id, name }` or null. */
export function workRoleInOrg(db: On<'accessRole', 'findFirst'>, roleId: string, organizationId: string) {
  return db.accessRole.findFirst({
    where: { id: roleId, organizationId, kind: 'WORK' },
    select: { id: true, name: true },
  });
}

/** These WORK roles of the organization, by name. */
export function workRolesByName(db: On<'accessRole', 'findMany'>, organizationId: string, ids: string[]) {
  return db.accessRole.findMany({
    where: { organizationId, kind: 'WORK', id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
