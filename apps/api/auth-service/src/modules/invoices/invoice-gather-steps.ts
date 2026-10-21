import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  personName,
  snapshotRates,
  dayKeyIn,
  effectiveBillBy,
  billsHours,
  lineAmount,
  type BillByValue,
  type RateBook,
} from '@hbcfield/shared';
import { jobHours } from './work-source';
import type { PrismaService } from '@hbcfield/shared';
import type { InvoiceGatherMessage } from '@hbcfield/shared/microservices';

/** The steps of `InvoiceGatherService.gather`, in the order it runs them. */

/** The message contract's type (shared with the gateway). */
export type GatherInput = InvoiceGatherMessage;

export interface GatherRefusal {
  success: false;
  message: string;
  statusCode: HttpStatus;
}

const refuse = (statusCode: HttpStatus, message: string): GatherRefusal => ({ success: false, message, statusCode });

const SPACE_SELECT = {
  id: true,
  name: true,
  kind: true,
  contactName: true,
  contactEmail: true,
  address: true,
  billableRateCents: true,
  costRateCents: true,
  timezone: true,
  currency: true,
  legalEntityId: true,
  sourceCustomerId: true,
} as const;

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  address: true,
  currency: true,
  legalEntityId: true,
} as const;

/** A workspace or a client — exactly one, both in the caller's organization. */
export async function loadGatherSource(prisma: PrismaService, data: GatherInput) {
  if (!data.spaceId && !data.customerId) {
    return { refusal: refuse(HttpStatus.BAD_REQUEST, 'Choose a workspace or a client to gather work from') };
  }
  if (data.spaceId && data.customerId) {
    // Two sources would silently intersect — and an empty result then reads
    // as "nothing to bill" when it means "these two do not overlap".
    return { refusal: refuse(HttpStatus.BAD_REQUEST, 'Gather from a workspace or a client, not both') };
  }

  const space = data.spaceId
    ? await prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId },
        select: SPACE_SELECT,
      })
    : null;
  if (data.spaceId && !space) {
    return { refusal: refuse(HttpStatus.NOT_FOUND, 'Space not found') };
  }
  /*
    ⚠️ ONLY A CUSTOMER WORKSPACE CAN BE BILLED, and the server says so rather
    than trusting the picker to have filtered.

    A workspace is a project, your own company, or a customer you do work for.
    The schema already carries that: `contactName`, `contactEmail` and the
    per-space billable rate exist on the CUSTOMER kind alone, and the Invoices
    tab on a workspace only appears for it. A list must not be stricter OR
    looser than the check behind it — the picker hides these, and this is what
    makes hiding them a rule instead of a decoration.
  */
  if (space && space.kind !== 'CUSTOMER') {
    return {
      refusal: refuse(HttpStatus.BAD_REQUEST, `${space.name} is not a customer workspace, so it cannot be invoiced`),
    };
  }

  const customer = data.customerId
    ? await prisma.customer.findFirst({
        where: { id: data.customerId, organizationId: data.organizationId },
        select: CUSTOMER_SELECT,
      })
    : null;
  if (data.customerId && !customer) {
    return { refusal: refuse(HttpStatus.NOT_FOUND, 'Client not found') };
  }
  return { space, customer };
}

type Loaded = Exclude<Awaited<ReturnType<typeof loadGatherSource>>, { refusal: GatherRefusal }>;
export type GatherSpace = Loaded['space'];

const RATED_PERSON = { id: true, firstName: true, lastName: true, billRateCents: true, costRateCents: true } as const;

export const GATHER_TASK_SELECT = {
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
      partsUsed: {
        select: { name: true, partNumber: true, quantity: true, unitCost: true },
      },
    },
  },
} as const;

export const GATHER_ASSIGNMENT_SELECT = {
  id: true,
  userId: true,
  billRateCents: true,
  costRateCents: true,
  billBy: true,
  hoursBasis: true,
  workRole: { select: { id: true, name: true, kind: true } },
  user: {
    select: { id: true, firstName: true, lastName: true, billRateCents: true, costRateCents: true, isExternal: true },
  },
} as const;

/** Exclude tasks already billed on a live invoice (any status except CANCELED). */
export async function billedTaskIds(prisma: PrismaService, organizationId: string, taskIds: string[]) {
  // A job is billed by its own line (`taskId`) or by the hours line that covered it (`taskIds`).
  const alreadyBilled = taskIds.length
    ? await prisma.invoiceItem.findMany({
        where: {
          OR: [{ taskId: { in: taskIds } }, { taskIds: { hasSome: taskIds } }],
          invoice: { organizationId, status: { not: 'CANCELED' } },
        },
        select: { taskId: true, taskIds: true },
      })
    : [];
  return new Set(alreadyBilled.flatMap((i) => [i.taskId, ...i.taskIds]).filter(Boolean) as string[]);
}

type RatedWorker = { billRateCents?: number | null; costRateCents?: number | null; id?: string } | null;
type AssignmentRates = {
  id: string;
  billRateCents: number | null;
  costRateCents: number | null;
  billBy: unknown;
  workRole: { id: string; name: string; kind: string } | null;
};

/** How each person here is billed — their own choice on the assignment. */
export const billByFor =
  (assignmentOf: Map<string, AssignmentRates>) =>
  (userId?: string | null): BillByValue => {
    const a = userId ? assignmentOf.get(userId) : undefined;
    return effectiveBillBy((a?.billBy as BillByValue | null) ?? null);
  };

/*
  ⚠️ ONE resolver, shared with the screen and the phone. The order of the
  four levels is written down exactly once, in `resolveRate` — a second copy
  here would be a second answer to "why is this €40", and the first person
  to find them disagreeing is looking at an invoice that is already wrong.
*/
export function ratesResolver(ctx: {
  book: RateBook;
  assignmentOf: Map<string, AssignmentRates>;
  space: GatherSpace;
  organizationId: string;
  org: { billableRateCents: number | null; costRateCents: number | null } | null;
}) {
  const { book, assignmentOf, space, organizationId, org } = ctx;
  return (worker: RatedWorker, day: string) => {
    const a = worker?.id ? assignmentOf.get(worker.id) : undefined;
    const at = (
      target: 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT',
      id: string | undefined,
      kind: 'BILL_HOUR' | 'COST_HOUR',
      column: number | null | undefined,
    ) => book.on(day, target, id, kind, column ?? null);
    return snapshotRates({
      contract: a
        ? {
            billRateCents: at('ASSIGNMENT', a.id, 'BILL_HOUR', a.billRateCents),
            costRateCents: at('ASSIGNMENT', a.id, 'COST_HOUR', a.costRateCents),
          }
        : null,
      member: worker?.id
        ? {
            billRateCents: at('MEMBER', worker.id, 'BILL_HOUR', worker.billRateCents),
            costRateCents: at('MEMBER', worker.id, 'COST_HOUR', worker.costRateCents),
          }
        : null,
      client: space
        ? {
            billRateCents: at('SPACE', space.id, 'BILL_HOUR', space.billableRateCents),
            costRateCents: at('SPACE', space.id, 'COST_HOUR', space.costRateCents),
          }
        : null,
      organization: {
        billRateCents: at('ORGANIZATION', organizationId, 'BILL_HOUR', org?.billableRateCents),
        costRateCents: at('ORGANIZATION', organizationId, 'COST_HOUR', org?.costRateCents),
      },
    });
  };
}

type GatherTask = Prisma.TaskGetPayload<{ select: typeof GATHER_TASK_SELECT }>;

const fullName = (u?: { firstName: string | null; lastName: string | null } | null) =>
  u ? personName(u) || null : null;

/** One completed job as a selectable card on the invoice builder. */
export function workEntryFor(
  t: GatherTask,
  ctx: {
    space: GatherSpace;
    tz: string;
    rate: number | null;
    assignmentOf: Map<string, AssignmentRates>;
    billByOf: (userId?: string | null) => BillByValue;
    ratesFor: ReturnType<typeof ratesResolver>;
  },
) {
  const { space } = ctx;
  const report = t.serviceReport;
  const worker = report?.completedBy ?? t.assignedTo ?? null;
  const workerName = fullName(worker);
  const hours = jobHours(report);
  const parts = (report?.partsUsed ?? []).map((p) => ({
    name: p.name,
    partNumber: p.partNumber ?? null,
    quantity: p.quantity ?? 1,
    unitCost: p.unitCost ?? 0,
    amount: lineAmount(p.quantity ?? 1, p.unitCost ?? 0),
  }));

  /*
    The rate THIS person is billed at, ON THE DAY the job was done — not one
    rate for the job, and not today's rate.
  */
  const workedOn = dayKeyIn(report?.completedAt ?? t.updatedAt, ctx.tz);
  const resolved = ctx.ratesFor(worker, workedOn);
  const billRate = resolved.billRateCents != null ? resolved.billRateCents / 100 : ctx.rate;
  const a = worker?.id ? ctx.assignmentOf.get(worker.id) : undefined;
  const workRole = a?.workRole?.kind === 'WORK' ? a.workRole : null;
  const billBy = ctx.billByOf(worker?.id);

  return {
    taskId: t.id,
    taskTitle: t.title,
    reportId: report?.id ?? null,
    workerId: worker?.id ?? null,
    workerName,
    hours,
    billRateCents: resolved.billRateCents,
    costRateCents: resolved.costRateCents,
    laborAmount: !space && billRate != null && billsHours(billBy) ? Math.round(hours * billRate * 100) / 100 : 0,
    completedAt: report?.completedAt ?? t.updatedAt ?? null,
    workedOn,
    workRoleId: workRole?.id ?? null,
    workRoleName: workRole?.name ?? null,
    billBy,
    /*
      On a WORKSPACE invoice the hours charged are the time ON SITE (the
      hours lines below), so a job's own hours are never charged — it is
      listed, and marked billed by the hours line. On a CLIENT invoice
      (no site) a job's hours are what is charged, as before.
    */
    hoursBillable: space ? false : billsHours(billBy),
    notes: report?.workPerformed || report?.summary || null,
    parts,
    hasReport: !!report,
  };
}
