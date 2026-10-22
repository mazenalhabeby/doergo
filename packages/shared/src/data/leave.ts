/**
 * Published reads of auth-service's `User` / `Organization` columns that the LEAVE ledger runs on
 * (allowances, employment start, leave year, carry-over) — see db.ts. Owner: auth-service; the reader is
 * task-service's leave. "Members" = active, internal, not portal clients.
 */
import { memberScopeFilter } from '../access/member-scope';
import type { On } from './db';

export const ORG_LEAVE_SELECT = {
  id: true,
  createdAt: true,
  timezone: true,
  defaultLeaveAllowance: true,
  leaveYearMode: true,
  carryOverMode: true,
  carryOverMaxDays: true,
  carryExpiresAfterMonths: true,
  leaveTrackingStartedOn: true,
} as const;

export const PERSON_LEAVE_SELECT = {
  id: true,
  organizationId: true,
  leaveAllowance: true,
  employmentStartDate: true,
  createdAt: true,
} as const;

const MEMBERS_WHERE = { isActive: true, isExternal: false, role: { not: 'CUSTOMER' as never } } as const;

/** Live organizations that carry leave over into the next year. */
export function orgsCarryingOver(db: On<'organization', 'findMany'>) {
  return db.organization.findMany({
    where: { carryOverMode: { not: 'NONE' } as never, isActive: true, suspendedAt: null },
    select: ORG_LEAVE_SELECT,
  });
}

/** One page of an organization's members' leave facts, by id (cursor = the last id of the page before). */
export function leavePeoplePage(db: On<'user', 'findMany'>, organizationId: string, batch: number, cursor?: string) {
  return db.user.findMany({
    where: { organizationId, ...MEMBERS_WHERE },
    select: PERSON_LEAVE_SELECT,
    orderBy: { id: 'asc' },
    take: batch,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

/** One person's leave facts and their organization's. */
export function personLeaveFacts(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: { ...PERSON_LEAVE_SELECT, organization: { select: ORG_LEAVE_SELECT } },
  });
}

/** Every member's leave facts and face, by name (≤ 2000) — the leave register, narrowed by scope. */
export function leaveRoster(db: On<'user', 'findMany'>, organizationId: string, scopeSpaceIds?: string[]) {
  return db.user.findMany({
    where: { organizationId, ...MEMBERS_WHERE, ...memberScopeFilter(scopeSpaceIds) },
    select: { ...PERSON_LEAVE_SELECT, firstName: true, lastName: true, email: true, avatarUrl: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 2000,
  });
}

/** These members' leave facts (only those in the caller's scope). */
export function leavePeopleIn(
  db: On<'user', 'findMany'>,
  ids: string[],
  organizationId: string,
  scopeSpaceIds?: string[],
) {
  return db.user.findMany({
    where: { id: { in: ids }, organizationId, ...MEMBERS_WHERE, ...memberScopeFilter(scopeSpaceIds) },
    select: PERSON_LEAVE_SELECT,
  });
}

/** The organization's leave facts. */
export function orgLeaveFacts(db: On<'organization', 'findUnique'>, organizationId: string) {
  return db.organization.findUnique({ where: { id: organizationId }, select: ORG_LEAVE_SELECT });
}

/** The day the organization started counting leave here. */
export function orgLeaveTrackingStart(db: On<'organization', 'findUnique'>, organizationId: string) {
  return db.organization.findUnique({ where: { id: organizationId }, select: { leaveTrackingStartedOn: true } });
}

/** A person's employment start and their organization's leave year (null = not one of its people). */
export function personEmploymentFacts(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, employmentStartDate: true, organization: { select: { leaveYearMode: true } } },
  });
}
