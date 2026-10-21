/**
 * Published reads of task-service's WORK tables for billing (`Task`, `ServiceReport`, `TimeEntry`) —
 * see db.ts. Owner: task-service; the callers are auth-service's invoices and the worker's statement.
 * Which period counts stays the caller's rule (invoices' `jobsInPeriod` / `clockInWindow`), passed in
 * as a filter. Columns here are a contract: changing one is a change for every caller.
 */
import type { Prisma } from '@prisma/client';
import type { On } from './db';

/** Finished work only. */
const FINISHED = { in: ['COMPLETED', 'CLOSED'] };
const RATED_PERSON = { id: true, firstName: true, lastName: true, billRateCents: true, costRateCents: true } as const;

/** What an invoice line is built from: the job, who did it at which rates, the report and its parts. */
export const JOB_TO_INVOICE_SELECT = {
  id: true,
  title: true,
  updatedAt: true,
  assignedTo: { select: RATED_PERSON },
  serviceReport: {
    select: {
      id: true,
      summary: true,
      workPerformed: true,
      workDuration: true,
      completedAt: true,
      completedBy: { select: RATED_PERSON },
      partsUsed: { select: { name: true, partNumber: true, quantity: true, unitCost: true } },
    },
  },
} as const;

/** The finished jobs of one workspace OR one client in a period, oldest first. */
export function finishedJobsToInvoice(
  db: On<'task', 'findMany'>,
  input: { organizationId: string; spaceId?: string; customerId?: string; period: Prisma.TaskWhereInput },
) {
  return db.task.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.spaceId ? { spaceId: input.spaceId } : { customerId: input.customerId }),
      status: FINISHED,
      ...input.period,
    },
    select: JOB_TO_INVOICE_SELECT,
    orderBy: { updatedAt: 'asc' },
  });
}

/** How many of these jobs / reports are the organization's — an invoice line may only point at its own. */
export function countJobsInOrg(db: On<'task', 'count'>, ids: string[], organizationId: string) {
  return db.task.count({ where: { id: { in: ids }, organizationId } });
}
export function countReportsInOrg(db: On<'serviceReport', 'count'>, ids: string[], organizationId: string) {
  return db.serviceReport.count({ where: { id: { in: ids }, organizationId } });
}

/** These people's clock-ins at one workspace (not rejected), with their shift and first overtime start. */
export function siteClockIns(
  db: On<'timeEntry', 'findMany'>,
  input: { organizationId: string; spaceId: string; userIds: string[]; clockInAt?: Prisma.DateTimeFilter },
) {
  return db.timeEntry.findMany({
    where: {
      organizationId: input.organizationId,
      locationId: input.spaceId,
      userId: { in: input.userIds },
      approvalStatus: { not: 'REJECTED' },
      ...(input.clockInAt ? { clockInAt: input.clockInAt } : {}),
    },
    select: {
      userId: true,
      clockInAt: true,
      clockOutAt: true,
      paidMinutes: true,
      totalMinutes: true,
      unpaidBreakMinutes: true,
      expectedClockInAt: true,
      expectedClockOutAt: true,
      // Shift hours are the shift alone: its own length, and where approved overtime began.
      shift: { select: { startLocal: true, endLocal: true } },
      overtimeRequests: {
        where: { status: { in: ['APPROVED', 'COMPLETED'] } },
        select: { overtimeStartAt: true },
        orderBy: { cycle: 'asc' },
        take: 1,
      },
    },
  });
}

/** Every finished job at one workspace by these people (report's author, else the assignee). */
export function siteFinishedJobsBy(
  db: On<'task', 'findMany'>,
  input: { organizationId: string; spaceId: string; userIds: string[]; range?: Prisma.DateTimeFilter },
) {
  const { organizationId, spaceId, userIds: ids, range } = input;
  return db.task.findMany({
    where: {
      organizationId,
      spaceId,
      status: FINISHED,
      OR: [
        { serviceReport: { completedById: { in: ids }, ...(range ? { completedAt: range } : {}) } },
        { serviceReport: null, assignedToId: { in: ids }, ...(range ? { updatedAt: range } : {}) },
      ],
    },
    select: {
      id: true,
      assignedToId: true,
      updatedAt: true,
      serviceReport: { select: { completedById: true, completedAt: true, workDuration: true } },
    },
  });
}

/** The jobs this person did (as the invoice counts them) in a period — the worker's statement. */
export function memberFinishedJobs(
  db: On<'task', 'findMany'>,
  input: { organizationId: string; memberId: string; period: Prisma.TaskWhereInput },
) {
  const { organizationId, memberId } = input;
  return db.task.findMany({
    where: {
      organizationId,
      status: FINISHED,
      AND: [
        {
          OR: [
            // Whoever completed the report did the work; with no report, the assignee.
            { serviceReport: { completedById: memberId } },
            { serviceReport: null, assignedToId: memberId },
          ],
        },
        input.period,
      ],
    },
    select: {
      id: true,
      updatedAt: true,
      spaceId: true,
      space: { select: { id: true, name: true, timezone: true, costRateCents: true } },
      serviceReport: { select: { workDuration: true, completedAt: true } },
    },
    orderBy: { updatedAt: 'asc' },
  });
}

/** This person's clock-ins (not rejected) in a window — the worker's statement. */
export function memberClockIns(
  db: On<'timeEntry', 'findMany'>,
  input: { organizationId: string; memberId: string; window: Prisma.TimeEntryWhereInput },
) {
  return db.timeEntry.findMany({
    where: {
      userId: input.memberId,
      organizationId: input.organizationId,
      approvalStatus: { not: 'REJECTED' },
      ...input.window,
    },
    select: {
      userId: true,
      locationId: true,
      clockInAt: true,
      clockOutAt: true,
      paidMinutes: true,
      totalMinutes: true,
      location: { select: { timezone: true } },
    },
  });
}
