/**
 * Published reads of auth-service's `User` columns that WORK runs on — the clock, the auto clock, a member's
 * day, working away from a site, schedules and availability, cost rates — see db.ts. Owner: auth-service.
 * ⚠️ Schedules, leave and assignments nested here are task-service's tables reached through the person.
 */
import { activeWindowWhere } from '../access/assignment-window';
import { memberScopeFilter } from '../access/member-scope';
import { ABSENCE_WHERE } from '../requests/request-kinds';
import type { On } from './db';

/** These people's cost rates (what they cost the organization per hour). */
export function peopleCostRates(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({ where: { id: { in: ids } }, select: { id: true, costRateCents: true } });
}

/** Whether a person may work away from a site, and their role. */
export function personRemoteFacts(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, allowRemote: true, role: true },
  });
}

/** The workspaces a person is assigned to today (task-service's assignments, reached through the person). */
export function personActiveSpaces(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: { spaceAssignments: { where: { ...activeWindowWhere() }, select: { spaceId: true } } },
  });
}

/**
 * Field employees who are switched on, with their schedule on these weekdays, approved leave touching the
 * range and current workspace assignments — the availability board. ⚠️ Schedules, leave and assignments
 * are task-service's tables reached THROUGH the person (one query); narrowed by the caller's scope.
 */
export function availabilityRoster(
  db: On<'user', 'findMany'>,
  input: { organizationId: string; scopeSpaceIds?: string[]; daysOfWeek: number[]; rangeStart: Date; rangeEnd: Date },
) {
  return db.user.findMany({
    where: {
      organizationId: input.organizationId,
      role: 'EMPLOYEE',
      isActive: true,
      ...memberScopeFilter(input.scopeSpaceIds),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      schedules: { where: { dayOfWeek: { in: input.daysOfWeek }, isActive: true } },
      timeOffRequests: {
        where: {
          status: 'APPROVED',
          ...ABSENCE_WHERE,
          startDate: { lte: input.rangeEnd },
          endDate: { gte: input.rangeStart },
        },
      },
      spaceAssignments: {
        where: { effectiveTo: null },
        select: { isPrimary: true, space: { select: { id: true, name: true, timezone: true } } },
      },
    },
  });
}

/** These people's names, trade, position and the weekdays they are scheduled (in the organization). */
export function peopleWorkingWeek(db: On<'user', 'findMany'>, ids: string[], organizationId: string) {
  return db.user.findMany({
    where: { id: { in: ids }, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialty: true,
      position: true,
      schedules: { where: { isActive: true }, select: { dayOfWeek: true } },
    },
  });
}

/** A member's automatic-clock consent and whether they are external (null = not in the organization). */
export function personAutoClockFacts(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, autoClockConsentAt: true, isExternal: true },
  });
}

/** A member's own timezone and their organization's — the member's day. */
export function personZones(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { timezone: true, organization: { select: { timezone: true } } },
  });
}

/** What a clock-in needs about the member (not a portal client). */
export const CLOCK_IN_USER_SELECT = {
  id: true,
  organizationId: true,
  allowRemote: true,
  role: true,
  organization: { select: { timezone: true } },
  // The member's own day, for the no-shift limit (memberDayZone).
  timezone: true,
  // The automatic clock: their consent, and that they are not external (who hold no clock).
  autoClockConsentAt: true,
  isExternal: true,
} as const;
export function personForClockIn(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId, role: { not: 'CUSTOMER' as never } },
    select: CLOCK_IN_USER_SELECT,
  });
}

/** What deciding "may this person receive tasks" reads: role, access modules and the legacy flags. */
const TASK_GATE = {
  role: true,
  enabledModules: true,
  canCreateTasks: true,
  canAssignTasks: true,
  canViewAllTasks: true,
  canManageUsers: true,
  taskCreationScope: true,
} as const;

/** One person's task gate. */
export function personTaskGate(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: TASK_GATE });
}

/** These people's names and task gate. */
export function peopleTaskGate(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, ...TASK_GATE },
  });
}

/** An active worker to put on a job — in the organization when given — with name, photo and task gate. */
export function workerToAssign(db: On<'user', 'findFirst'>, userId: string, organizationId?: string) {
  return db.user.findFirst({
    where: { id: userId, isActive: true, ...(organizationId ? { organizationId } : {}) },
    select: { id: true, firstName: true, lastName: true, avatarUrl: true, ...TASK_GATE },
  });
}

/**
 * Up to `limit` active people of the organization (except the job's creator; only this roster when given)
 * with trade, rating, last position and how many jobs they have in hand — the "who could do it" list.
 * ⚠️ The last position (tracking-service) and open jobs (task-service) are reached through the person.
 */
export function suggestionCandidates(
  db: On<'user', 'findMany'>,
  input: { organizationId: string; exceptUserId?: string; roster?: string[]; limit: number },
) {
  return db.user.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      id: { not: input.exceptUserId },
      ...(input.roster ? { id: { in: input.roster, not: input.exceptUserId } } : {}),
    },
    take: input.limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      specialty: true,
      rating: true,
      ratingCount: true,
      lastLocation: { select: { lat: true, lng: true, updatedAt: true } },
      _count: {
        select: {
          assignedTasks: { where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] } } },
        },
      },
    },
  });
}
