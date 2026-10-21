import { Injectable } from '@nestjs/common';
import {
  zoneOf,
  usesTwoRates,
  loadRateBook,
  type DayEntry,
  type HoursEntry,
  resolveInvoiceCurrency,
  currencyOrNull,
  DEFAULT_CURRENCY,
} from '@hbcfield/shared';
import { jobsInPeriod, FINISHED } from './work-source';
import { PrismaService } from '@hbcfield/shared';
import { ExchangeRateService } from './exchange-rate.service';
import { LegalEntitiesService } from './legal-entities.service';
import { SiteTimeService } from './site-time.service';
import { InvoiceServiceBase } from './invoice-service.base';
import {
  GATHER_ASSIGNMENT_SELECT,
  GATHER_TASK_SELECT,
  billByFor,
  billedTaskIds,
  loadGatherSource,
  ratesResolver,
  workEntryFor,
  type GatherInput,
} from './invoice-gather-steps';

/** Gathering a period's work into invoice lines: jobs, hours and days. */
@Injectable()
export class InvoiceGatherService extends InvoiceServiceBase {
  constructor(
    prisma: PrismaService,
    rates: ExchangeRateService,
    entities: LegalEntitiesService,
    private readonly siteTime: SiteTimeService,
  ) {
    super(prisma, rates, entities);
  }

  /**
   * Build (but do NOT persist) a rich, system-sourced view of a CUSTOMER space's
   * completed, not-yet-invoiced work — one entry per completed job carrying the
   * WORKER who did it (service-report completedBy, else the assignee), the HOURS
   * worked (tracked duration), the work NOTES, and the PARTS used. Labor is
   * priced from the resolved billable rate (space override → org default → blank
   * for manual entry). Tasks already billed on a live (non-canceled) invoice are
   * skipped so nothing is double-billed. Also returns a per-worker hours summary.
   * The builder UI renders these as selectable cards and flattens the chosen ones
   * into invoice line items on save.
   */
  /**
   * The work worth billing, from whichever end the biller has.
   *
   * ⚠️ IT ONLY EVER ANSWERED FOR A WORKSPACE, and a workspace is not how every
   * organization bills. A field company bills a CLIENT — whose jobs may sit in
   * three workspaces or in none — and plenty of invoices are for something that
   * was never a task at all. Requiring a space made the first case impossible
   * and the third look broken.
   *
   * So the source is a choice: a workspace, a client, or nothing. Exactly one
   * of the first two, because "all the completed work in the organization" is
   * not an invoice, it is an accident waiting to be sent to somebody.
   *
   * ⚠️ Both are scoped to the caller's organization in the lookup, not in the
   * task filter. A customer id from another tenant fails to resolve and returns
   * 404 — it never reaches a query that could return that tenant's work.
   */
  async gather(data: GatherInput) {
    const source = await loadGatherSource(this.prisma, data);
    if ('refusal' in source) return source.refusal;
    const { space, customer } = source;

    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { billableRateCents: true, costRateCents: true, currency: true },
    });
    // Who would issue it — the same rule the create applies — so the screen can say so before it exists.
    const issuer = await this.issuingEntity(
      data.organizationId,
      null,
      space?.legalEntityId ?? null,
      space?.sourceCustomerId ?? customer?.id ?? null,
    );
    const company = 'error' in issuer ? null : issuer.entity;
    // Workspace → client → company → organization: the same order the rates follow.
    const invoiceCurrency = resolveInvoiceCurrency({ space, customer, company, organization: org });
    const baseCurrency = currencyOrNull(org?.currency) ?? DEFAULT_CURRENCY;
    /*
      A client has no rate of its own, so it falls to the organization's. That is
      the honest answer rather than nothing: the form shows the rate and the
      biller changes it, and a blank costs them a lookup they should not need.
    */
    const rateCents = space?.billableRateCents ?? org?.billableRateCents ?? null;
    const rate = rateCents != null ? rateCents / 100 : null; // currency units/hour

    /*
      THE SERVICE PERIOD.

      ⚠️ Without one this returned EVERY unbilled job for the client, ever — so
      a company that invoices monthly could not invoice August separately from
      September, and the first invoice anybody raised swept up work they had
      not meant to bill yet. Both ends are optional: omitting them keeps the old
      behaviour, which is right for "bill me everything outstanding".

      ⚠️ The date a job COUNTS on is when the work was done, not when the row
      was touched. That is the report's `completedAt` where there is a report,
      and `updatedAt` only as a fallback for a task closed without one — which
      is why this is an OR over two columns rather than a filter on one. A
      filter on `updatedAt` alone would move a job into a different month
      because somebody edited its title.

      ⚠️ Inclusive at both ends, and `to` is pushed to the end of that day. A
      half-open range here silently drops everything done on the last day of the
      month, which is the single most common day to finish a job before billing.
    */
    // Which jobs, in which period — the rule shared with the worker's statement.
    const withinPeriod = jobsInPeriod(data.from, data.to);

    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: data.organizationId,
        ...(space ? { spaceId: space.id } : { customerId: customer!.id }),
        status: FINISHED,
        ...withinPeriod,
      },
      select: GATHER_TASK_SELECT,
      orderBy: { updatedAt: 'asc' },
    });

    const billed = await billedTaskIds(
      this.prisma,
      data.organizationId,
      tasks.map((t) => t.id),
    );

    /*
      Everybody who works HERE: their assignment carries the top rung of the rate
      ladder, their trade (work role) and how they are billed. Loaded for the
      whole workspace — not only the people on a job — because somebody billed
      by the day may have worked every day of the month and closed no job.
      One query; the space has tens of members, not thousands.
    */
    const workerIds = Array.from(
      new Set(
        tasks.flatMap((t) => [t.serviceReport?.completedBy?.id, t.assignedTo?.id]).filter((id): id is string => !!id),
      ),
    );
    const assignments = space
      ? await this.prisma.spaceAssignment.findMany({
          where: { spaceId: space.id, organizationId: data.organizationId },
          select: GATHER_ASSIGNMENT_SELECT,
        })
      : [];
    const assignmentOf = new Map(assignments.map((a) => [a.userId, a]));
    const billByOf = billByFor(assignmentOf);

    /*
      ⚠️ EVERY RATE AS IT WAS ON THE DAY THE WORK WAS DONE.

      All the dated rates this invoice could need — organization, client,
      members, assignments, work-role day rates here — in ONE query, then each
      job and each day is priced by the rate in force on its own day. A raise
      from 1 November leaves every October day at October's rate, on this
      invoice or any later one.
    */
    const book = await loadRateBook(this.prisma, data.organizationId, {
      organizationIds: [data.organizationId],
      spaceIds: space ? [space.id] : [],
      memberIds: [...workerIds, ...assignments.map((a) => a.userId)],
      assignmentIds: assignments.map((a) => a.id),
      roleIds: assignments.map((a) => a.workRole?.id).filter((x): x is string => !!x),
      roleSpaceId: space?.id ?? null,
    });
    const tz = zoneOf(space?.timezone);
    const ratesFor = ratesResolver({ book, assignmentOf, space, organizationId: data.organizationId, org });

    const workEntries: ReturnType<typeof workEntryFor>[] = [];
    const workerHours = new Map<string, { name: string; hours: number }>();
    for (const t of tasks) {
      if (billed.has(t.id)) continue;
      const entry = workEntryFor(t, { space, tz, rate, assignmentOf, billByOf, ratesFor });
      workEntries.push(entry);
      if (entry.workerId && entry.hours > 0) {
        const prev = workerHours.get(entry.workerId) ?? { name: entry.workerName ?? 'Worker', hours: 0 };
        prev.hours = Math.round((prev.hours + entry.hours) * 100) / 100;
        workerHours.set(entry.workerId, prev);
      }
    }

    // Time on site: each person's hours runs and day runs at this workspace.
    const jobWorkers = new Map<string, string>();
    for (const w of workEntries) if (w.workerId && w.workerName) jobWorkers.set(w.workerId, w.workerName);
    const { hourEntries, dayEntries, workDays } = space
      ? await this.siteTime.gatherSiteTime({
          organizationId: data.organizationId,
          spaceId: space.id,
          tz,
          from: data.from,
          to: data.to,
          assignments,
          jobWorkers,
          billByOf,
          book,
          ratesFor,
          billedTasks: billed,
        })
      : { hourEntries: [] as HoursEntry[], dayEntries: [] as DayEntry[], workDays: [] as string[] };
    /*
      Every day with something still to bill — the period picker marks them and
      "Outstanding" reads its dates from the first and last. Days, not a span:
      a gap of three weeks with nothing in it should look like one.
    */
    const outstandingDays = [...new Set([...workDays, ...workEntries.map((w) => w.workedOn).filter(Boolean)])].sort();
    return {
      success: true,
      data: {
        spaceId: space?.id ?? null,
        customerId: customer?.id ?? null,
        clientName: space ? space.contactName || space.name : customer!.name,
        clientEmail: (space ? space.contactEmail : customer!.email) ?? null,
        clientAddress: (space ? space.address : customer!.address) ?? null,
        currency: invoiceCurrency.currency,
        currencySource: invoiceCurrency.source,
        /** The company that would issue it (the create resolves it again, the same way). */
        legalEntityId: company?.id ?? null,
        /** What costs and the margin are in — the organization's. */
        baseCurrency,
        billableRateCents: rateCents,
        rate,
        taskCount: workEntries.length,
        totalHours: Array.from(workerHours.values()).reduce((s, w) => s + w.hours, 0),
        workerSummary: Array.from(workerHours.values()).sort((a, b) => b.hours - a.hours),
        /*
          ⚠️ Answered from the DATA, never from a setting. An organization that
          has never entered a cost rate is a one-rate business and must not be
          shown a margin column; the day somebody enters one it is worth having.
          A switch here would be a feature nobody finds.
        */
        /* Echoed so the invoice can state the period it covers — which is what
           makes two monthly invoices for one client tellable apart. */
        periodFrom: data.from ?? null,
        periodTo: data.to ?? null,
        /** The workspace's zone — the days below are calendar days there. */
        timezone: tz,
        /**
         * Days worked here, per person, split wherever their day rate changed.
         * Only people whose billing includes days; days already on a live
         * invoice are left out, exactly as billed jobs are.
         */
        dayEntries,
        /**
         * Hours ON SITE here, per person, split wherever their hourly rate
         * changed — what a workspace invoice charges by the hour. Hours already
         * on a live invoice are left out.
         */
        hourEntries,
        outstandingDays,
        twoRates: usesTwoRates([
          { billRateCents: org?.billableRateCents, costRateCents: org?.costRateCents },
          space ? { billRateCents: space.billableRateCents, costRateCents: space.costRateCents } : null,
          ...workEntries.map((w) => ({ costRateCents: w.costRateCents })),
          ...dayEntries.map((d) => ({ costRateCents: d.costCents ?? null })),
          ...hourEntries.map((h) => ({ costRateCents: h.costCents ?? null })),
        ]),
        workEntries,
      },
    };
  }
}
