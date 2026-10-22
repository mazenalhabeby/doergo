/**
 * Published reads of auth-service's `User` columns that CHAT's contact rules run on (who may message whom:
 * access, modules, contact scope, contactable, presence) — see db.ts. Owner: auth-service; the reader is
 * task-service's chat. Member chat is staff-only: portal clients never appear.
 */
import { ORG_ACCESS_SELECT } from '../access/org-access';
import type { On } from './db';

/** A person as the chat directory shows them. */
export const CHAT_PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  position: true,
  role: true,
  contactable: true,
  canManageUsers: true,
  presence: true,
} as const;

/** One person's org access facts. */
export function personOrgAccess(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: ORG_ACCESS_SELECT });
}

/** What decides whether a person may start chats at all: access, role, modules, external. */
export function personChatGate(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { ...ORG_ACCESS_SELECT, role: true, enabledModules: true, isExternal: true },
  });
}

/** A person's own contact rules: access, modules, who they may contact. */
export function personContactRules(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { ...ORG_ACCESS_SELECT, enabledModules: true, contactScope: true, contactAllowedIds: true },
  });
}

/** A person's modules (null = no such account). */
export function personModules(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { enabledModules: true } });
}

/** Both ends of a conversation, as the send-time check reads them (access + contact rules). */
export function personContactFacts(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: {
      ...ORG_ACCESS_SELECT,
      id: true,
      organizationId: true,
      isActive: true,
      contactable: true,
      enabledModules: true,
      contactScope: true,
      contactAllowedIds: true,
    },
  });
}

/** These active people of the organization, as a contact check needs them. */
export function chatPeople(db: On<'user', 'findMany'>, ids: string[], organizationId: string) {
  return db.user.findMany({
    where: { id: { in: ids }, organizationId, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true, contactable: true, canManageUsers: true },
  });
}

/** One person of the organization as a conversation header shows them. */
export function chatPerson(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      position: true,
      role: true,
      contactable: true,
      canManageUsers: true,
    },
  });
}

/** The organization's active staff except the caller, by first name — the chat directory. */
export function chatDirectory(db: On<'user', 'findMany'>, organizationId: string, exceptUserId: string) {
  return db.user.findMany({
    where: { organizationId, isActive: true, id: { not: exceptUserId }, role: { not: 'CUSTOMER' as never } },
    select: CHAT_PERSON,
    orderBy: [{ firstName: 'asc' }],
  });
}

/** Active staff of OTHER organizations (by id), with their organization — a shared workspace's people. */
export function crossOrgCandidates(db: On<'user', 'findMany'>, ids: string[], organizationIds: string[]) {
  return db.user.findMany({
    where: {
      id: { in: ids },
      isActive: true,
      role: { not: 'CUSTOMER' as never },
      organizationId: { in: organizationIds },
    },
    select: { ...CHAT_PERSON, organizationId: true },
    orderBy: [{ firstName: 'asc' }],
  });
}

/** These active people's organization and role. */
export function peopleOrgAndRole(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, organizationId: true, role: true },
  });
}
