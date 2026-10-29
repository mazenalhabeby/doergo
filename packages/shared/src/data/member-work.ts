/**
 * Published reads of task-service's tables ABOUT ONE MEMBER (`Task`, `TaskEvent`, `TimeEntry` and the
 * other work tables) — see db.ts. Owner: task-service; the caller is auth-service's member screens.
 * `spaceIds` undefined = org-wide viewer; a list = only work in those workspaces.
 */
import type { On } from './db';
import { TERMINAL_STATUSES } from '../constants/task';

const inSpaces = (spaceIds?: string[]) => (spaceIds ? { spaceId: { in: spaceIds } } : {});
const atSites = (spaceIds?: string[]) => (spaceIds ? { locationId: { in: spaceIds } } : {});

/** A member's jobs counted by status and by priority, and how many were created since `since`. */
export function memberJobCounts(
  db: On<'task', 'groupBy' | 'count'>,
  memberId: string,
  since: Date,
  spaceIds?: string[],
) {
  const where = { assignedToId: memberId, ...inSpaces(spaceIds) };
  return Promise.all([
    db.task.groupBy({ by: ['status'], where, _count: { status: true } }),
    db.task.groupBy({ by: ['priority'], where, _count: { priority: true } }),
    db.task.count({ where: { ...where, createdAt: { gte: since } } }),
  ]);
}

/** Finished jobs of a member done by their due date (or with none) — all time, every workspace. */
export function memberJobsOnTime(db: On<'task', 'count' | 'fields'>, memberId: string) {
  return db.task.count({
    where: {
      assignedToId: memberId,
      status: { in: ['COMPLETED', 'CLOSED'] },
      OR: [{ dueDate: null }, { updatedAt: { lte: db.task.fields.dueDate } }],
    },
  });
}

/**
 * The member's jobs still open: on its crew (a crew row) or named the old way (the column), in a step that is
 * not finished — finished in the WORKFLOW's own words (isFinal / isCanceled: "Delivered", "Done"), not only the
 * canonical COMPLETED/CANCELED/CLOSED. Two queries, whatever the number of jobs.
 */
export async function memberOpenJobs(
  db: On<'task', 'findMany'> & On<'workflowStatus', 'findMany'>,
  memberId: string,
  organizationId?: string,
): Promise<Array<{ id: string; status: string; workflowId: string | null }>> {
  const candidates = await db.task.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      status: { notIn: [...TERMINAL_STATUSES] },
      OR: [{ assignedToId: memberId }, { assignees: { some: { userId: memberId } } }],
    },
    select: { id: true, status: true, workflowId: true },
  });
  const flowIds = [...new Set(candidates.map((t) => t.workflowId).filter((x): x is string => !!x))];
  if (!flowIds.length) return candidates;
  const finished = new Set(
    (
      await db.workflowStatus.findMany({
        where: { workflowId: { in: flowIds }, OR: [{ isFinal: true }, { isCanceled: true }] },
        select: { workflowId: true, key: true },
      })
    ).map((s) => `${s.workflowId}:${s.key}`),
  );
  return candidates.filter((t) => !(t.workflowId && finished.has(`${t.workflowId}:${t.status}`)));
}

/**
 * How many jobs a member has in hand now — every unfinished job they are on (crew row or column), not only the
 * five canonical working steps: a crew member or a custom workflow's step was invisible to it, so a member could be
 * switched off while still on open crews.
 */
export async function memberOpenJobCount(
  db: On<'task', 'findMany'> & On<'workflowStatus', 'findMany'>,
  memberId: string,
  organizationId?: string,
): Promise<number> {
  return (await memberOpenJobs(db, memberId, organizationId)).length;
}

/** A member's latest 100 jobs, newest first (org-scoped when the organization is given). */
export function memberJobList(db: On<'task', 'findMany'>, memberId: string, organizationId?: string) {
  return db.task.findMany({
    where: { assignedToId: memberId, ...(organizationId ? { organizationId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      locationAddress: true,
      createdAt: true,
    },
  });
}

/** A member's clock-ins since `since` with their minutes and the geofence mark. */
export function memberClockInsSince(
  db: On<'timeEntry', 'findMany'>,
  memberId: string,
  since: Date,
  spaceIds?: string[],
) {
  return db.timeEntry.findMany({
    where: { userId: memberId, clockInAt: { gte: since }, ...atSites(spaceIds) },
    select: { totalMinutes: true, clockInWithinGeofence: true, clockInAt: true },
  });
}

/** Is this member on the clock right now (an open time entry)? One indexed count. */
export async function memberIsClockedIn(db: On<'timeEntry', 'count'>, memberId: string): Promise<boolean> {
  return (await db.timeEntry.count({ where: { userId: memberId, status: 'CLOCKED_IN' } })) > 0;
}

/** A member's latest 10 job events (the activity panel). */
export function memberRecentJobEvents(db: On<'taskEvent', 'findMany'>, memberId: string, spaceIds?: string[]) {
  return db.taskEvent.findMany({
    where: { userId: memberId, ...(spaceIds ? { task: { spaceId: { in: spaceIds } } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, eventType: true, createdAt: true, task: { select: { title: true } } },
  });
}

/** A member's latest 5 clock-ins (the activity panel). */
export function memberRecentClockIns(db: On<'timeEntry', 'findMany'>, memberId: string, spaceIds?: string[]) {
  return db.timeEntry.findMany({
    where: { userId: memberId, ...atSites(spaceIds) },
    orderBy: { clockInAt: 'desc' },
    take: 5,
    select: { id: true, clockInAt: true, clockOutAt: true, location: { select: { name: true } } },
  });
}

type Counted =
  | 'task'
  | 'comment'
  | 'attachment'
  | 'taskEvent'
  | 'serviceReport'
  | 'reportDefinition'
  | 'reportSchedule'
  | 'recurringTaskTemplate'
  | 'supportTicket'
  | 'message'
  | 'timeEntry'
  | 'overtimeRequest'
  | 'assetCustody'
  | 'assetHolder'
  | 'assetMoney';

/**
 * Everything a member left in task-service's tables, as count QUERIES (not awaited) — the caller runs
 * them in one `$transaction` with its own, so "no history" is one snapshot. Order: jobs created, jobs
 * assigned, comments, attachments, job events, reports, report definitions, report schedules,
 * recurring templates, support tickets, messages, time entries, overtime, custody periods (held or
 * handed), equipment held now, money filed or reviewed on equipment.
 *
 * ⚠️ Equipment IS history: a member who held a van has periods its ledger is attributed by, and one
 * who holds it now must give it back (offboarding) — a hard delete would drop both silently.
 */
export function memberWorkFootprint(db: { [K in Counted]: On<K, 'count'>[K] }, memberId: string) {
  return [
    db.task.count({ where: { createdById: memberId } }),
    db.task.count({ where: { assignedToId: memberId } }),
    db.comment.count({ where: { userId: memberId } }),
    db.attachment.count({ where: { uploadedById: memberId } }),
    db.taskEvent.count({ where: { userId: memberId } }),
    db.serviceReport.count({ where: { completedById: memberId } }),
    db.reportDefinition.count({ where: { createdById: memberId } }),
    db.reportSchedule.count({ where: { createdById: memberId } }),
    db.recurringTaskTemplate.count({ where: { createdById: memberId } }),
    db.supportTicket.count({ where: { createdById: memberId } }),
    db.message.count({ where: { senderId: memberId } }),
    db.timeEntry.count({ where: { userId: memberId } }),
    db.overtimeRequest.count({ where: { technicianId: memberId } }),
    db.assetCustody.count({
      where: { OR: [{ userId: memberId }, { openedById: memberId }, { closedById: memberId }] },
    }),
    db.assetHolder.count({ where: { userId: memberId } }),
    db.assetMoney.count({ where: { OR: [{ authorId: memberId }, { reviewedById: memberId }] } }),
  ] as const;
}
