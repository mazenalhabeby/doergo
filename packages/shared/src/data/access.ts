/**
 * Published reads of the facts a person's ACCESS is resolved from (`memberAccessOf`) — auth-service's
 * `User` + role columns, with the workspace assignments in force — see db.ts. Owner: auth-service.
 */
import { activeWindowWhere } from '../access/assignment-window';
import { ORG_ACCESS_SELECT } from '../access/org-access';
import type { On } from './db';

/** One member's access facts, with only the assignments in these workspaces (all, when none given). */
export function memberAccessFactsIn(
  db: On<'user', 'findFirst'>,
  input: { userId: string; organizationId: string; spaceIds: string[]; now: Date },
) {
  return db.user.findFirst({
    where: { id: input.userId, organizationId: input.organizationId },
    select: {
      ...ORG_ACCESS_SELECT,
      spaceAssignments: {
        where: {
          ...(input.spaceIds.length ? { spaceId: { in: input.spaceIds } } : {}),
          ...activeWindowWhere(input.now),
        },
        select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
      },
    },
  });
}

/**
 * Every active member except these, with face, external flag and access facts — the assignments only in
 * this one workspace (none for an org-wide question). "Who else could decide this?"
 */
export function orgMembersWithAccess(
  db: On<'user', 'findMany'>,
  input: { organizationId: string; exclude: string[]; spaceId: string | null; now: Date },
) {
  return db.user.findMany({
    where: { organizationId: input.organizationId, isActive: true, id: { notIn: input.exclude } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      isExternal: true,
      ...ORG_ACCESS_SELECT,
      spaceAssignments: input.spaceId
        ? {
            where: { spaceId: input.spaceId, ...activeWindowWhere(input.now) },
            select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
          }
        : { where: { id: '__none__' }, select: { spaceId: true } },
    },
  });
}

/** One ACTIVE member's access facts with every assignment in force — "what may they decide". */
export function activeMemberAccessFacts(
  db: On<'user', 'findFirst'>,
  userId: string,
  organizationId: string,
  now: Date,
) {
  return db.user.findFirst({
    where: { id: userId, organizationId, isActive: true },
    select: {
      ...ORG_ACCESS_SELECT,
      spaceAssignments: {
        where: { ...activeWindowWhere(now) },
        select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
      },
    },
  });
}

/** The organization's active internal people with names and access facts, by name (≤ 500). */
export function staffWithAccess(db: On<'user', 'findMany'>, organizationId: string, now: Date) {
  return db.user.findMany({
    where: { organizationId, isActive: true, isExternal: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      ...ORG_ACCESS_SELECT,
      spaceAssignments: {
        where: { ...activeWindowWhere(now) },
        select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 500,
  });
}
