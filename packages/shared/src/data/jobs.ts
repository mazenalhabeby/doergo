/**
 * Published reads of task-service's tables (`Task`, `TimeEntry`, `ConversationMember`, `SupportTicket`)
 * — see db.ts. Owner: task-service. Columns here are a contract: changing one is a change for every caller.
 */
import type { On } from './db';

/** A workspace-scoped caller sees only jobs in its workspaces; undefined = org-wide, [] = nothing. */
const jobInScope = (scopeSpaceIds?: string[]) =>
  scopeSpaceIds === undefined ? {} : { spaceId: { in: scopeSpaceIds } };

/** Who a job's live room may reach — its place and its people (the socket's own access rule). */
export function jobRoomFacts(db: On<'task', 'findFirst'>, taskId: string, organizationId: string) {
  return db.task.findFirst({
    where: { id: taskId, organizationId },
    select: {
      organizationId: true,
      spaceId: true,
      assignedToId: true,
      assignees: { select: { userId: true } },
      openRoleId: true,
      openSpotsLeft: true,
      status: true,
    },
  });
}

/** Where a "this job changed" announcement goes: its organization, workspace and people (≤ 50). */
export function jobAudience(db: On<'task', 'findUnique'>, taskId: string) {
  return db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      organizationId: true,
      spaceId: true,
      assignedToId: true,
      assignees: { select: { userId: true }, take: 50 },
    },
  });
}

/** What a GPS point needs to know about its job: may this person add to it, and which trip is it on. */
export function jobTripFacts(db: On<'task', 'findUnique'>, taskId: string) {
  return db.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      assignedToId: true,
      assignees: { select: { userId: true } },
      routeStartedAt: true,
      routeEndedAt: true,
    },
  });
}

/** One job's trip as the live map reads it (the metres are tracking's own `route`). */
export function jobTrip(
  db: On<'task', 'findFirst'>,
  taskId: string,
  organizationId?: string,
  scopeSpaceIds?: string[],
) {
  return db.task.findFirst({
    where: { id: taskId, ...(organizationId ? { organizationId } : {}), ...jobInScope(scopeSpaceIds) },
    select: {
      id: true,
      status: true,
      routeStartedAt: true,
      routeEndedAt: true,
      route: { select: { legStartedAt: true, distanceMeters: true } },
      assignedToId: true,
    },
  });
}

/** The job a worker is driving to right now, if any. */
export function jobEnRouteFor(
  db: On<'task', 'findFirst'>,
  workerId: string,
  organizationId?: string,
  scopeSpaceIds?: string[],
) {
  return db.task.findFirst({
    where: {
      assignedToId: workerId,
      status: 'EN_ROUTE',
      ...(organizationId ? { organizationId } : {}),
      ...jobInScope(scopeSpaceIds),
    },
    select: {
      id: true,
      title: true,
      routeStartedAt: true,
      route: { select: { legStartedAt: true, distanceMeters: true } },
      locationLat: true,
      locationLng: true,
    },
  });
}

/** The jobs these workers are on now (driving, on site, working) — for the live map's labels. */
export function jobsUnderwayFor(db: On<'task', 'findMany'>, workerIds: string[], scopeSpaceIds?: string[]) {
  return db.task.findMany({
    where: {
      assignedToId: { in: workerIds },
      status: { in: ['EN_ROUTE', 'IN_PROGRESS', 'ARRIVED'] },
      ...jobInScope(scopeSpaceIds),
    },
    select: { id: true, title: true, status: true, assignedToId: true },
  });
}

/** Is this member on the clock right now? */
export async function isOnTheClock(db: On<'timeEntry', 'findFirst'>, userId: string): Promise<boolean> {
  return !!(await db.timeEntry.findFirst({ where: { userId, status: 'CLOCKED_IN' }, select: { id: true } }));
}

/** Who is in a conversation. */
export async function conversationMemberIds(
  db: On<'conversationMember', 'findMany'>,
  conversationId: string,
): Promise<string[]> {
  return (await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } })).map(
    (m) => m.userId,
  );
}

/** Who opened a support ticket. */
export async function ticketCreatorId(db: On<'supportTicket', 'findUnique'>, ticketId: string): Promise<string | null> {
  return (
    (await db.supportTicket.findUnique({ where: { id: ticketId }, select: { createdById: true } }))?.createdById ?? null
  );
}
