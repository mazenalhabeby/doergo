import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  paginated, snapshotRates, usesTwoRates, cleanRateCents,
  clientDocumentLocale, DEFAULT_LOCALE, type SupportedLocale,
  loadRateBook, dayKeyIn, parseDayKey, effectiveBillBy, billsHours, billsDays, workedDays,
  type BillByValue, type DayEntry,
} from '@hbcfield/shared';

/** The invoice line kinds a caller may file. */
const LINE_KINDS = new Set(['HOURS', 'DAYS', 'HEADING']);

import { dayStart, dayEnd, jobsInPeriod, jobHours, FINISHED } from './work-source';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    createdById: string;
    spaceId?: string;
    clientName?: string;
    clientEmail?: string;
    clientAddress?: string;
    currency?: string;
    taxRate?: number;
    discount?: number;
    issueDate?: string;
    dueDate?: string;
    /** The days this invoice covers, `YYYY-MM-DD`. Either end may be omitted. */
    servicePeriodFrom?: string;
    servicePeriodTo?: string;
    notes?: string;
    items?: {
      description: string;
      quantity?: number;
      unitPrice?: number;
      taskId?: string;
      reportId?: string;
      /** The rates that applied when this line was drawn up. See below. */
      billRateCents?: number | null;
      costRateCents?: number | null;
      billedHours?: number | null;
      billedDays?: number | null;
      lineKind?: 'HOURS' | 'DAYS' | 'HEADING' | null;
      workerId?: string | null;
      dayFrom?: string | null;
      dayTo?: string | null;
    }[];
  }) {
    // When tied to a CUSTOMER space, snapshot its contact details as fallbacks so
    // the invoice stays stable even if the space changes later.
    let clientName = data.clientName;
    let clientEmail = data.clientEmail;
    let clientAddress = data.clientAddress;
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId },
        select: { name: true, contactName: true, contactEmail: true, address: true },
      });
      if (space) {
        clientName = clientName || space.contactName || space.name;
        clientEmail = clientEmail ?? space.contactEmail ?? undefined;
        clientAddress = clientAddress ?? space.address ?? undefined;
      }
    }
    if (!clientName || !clientName.trim()) {
      return {
        success: false,
        message: 'A client name (or a customer space) is required',
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    const items = (data.items || []).map((item) => {
      const quantity = item.quantity ?? 1;
      const unitPrice = item.unitPrice ?? 0;
      return {
        description: item.description,
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
        taskId: item.taskId,
        reportId: item.reportId,
        /*
          ⚠️ THE RATES AS THEY WERE ON THE DAY, written onto the line.

          Not a cache of the ladder — the record of it. The ladder answers "what
          is this rate now"; an issued invoice has to keep answering "what was
          it then". Give somebody a raise in June and a paid invoice from March
          moves the instant anything re-resolves instead of reading these.

          Sent by the caller, which is the screen that showed the biller those
          exact numbers before they pressed save — so what is filed is what was
          agreed to, not what the database happens to say a second later.
        */
        /*
          ⚠️ CLEANED, not trusted. These arrive from a browser, are multiplied
          by hours, and land in an organization's books — an unbounded integer
          is a way to put an absurd total on an invoice from a form, and a
          fractional cent is a rounding bug waiting for a large one. Anything
          unusable becomes null, which reads as "no rate recorded" rather than
          as a rate of nothing.
        */
        billRateCents: cleanRateCents(item.billRateCents),
        costRateCents: cleanRateCents(item.costRateCents),
        billedHours:
          typeof item.billedHours === 'number' && Number.isFinite(item.billedHours) && item.billedHours >= 0
            ? Math.min(item.billedHours, 100_000)
            : null,
        ...this.dayLineFields(item),
      };
    });
    const badWorker = await this.unknownWorker(data.organizationId, items);
    if (badWorker) return badWorker;

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = data.taxRate ?? 0;
    const discount = data.discount ?? 0;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount - discount;

    // Invoice-number generation is read-then-write, so two concurrent creates can
    // pick the same sequence. @@unique([organizationId, invoiceNumber]) makes the
    // collision loud (P2002) instead of silently duplicating; retry a few times,
    // re-reading the latest number each pass, before surfacing the error.
    let invoice;
    for (let attempt = 0; ; attempt++) {
      const invoiceNumber = await this.generateInvoiceNumber(data.organizationId);
      try {
        invoice = await this.prisma.invoice.create({
          data: {
            invoiceNumber,
            spaceId: data.spaceId,
            clientName,
            clientEmail,
            clientAddress,
            currency: data.currency ?? 'EUR',
            taxRate,
            discount,
            subtotal,
            taxAmount,
            total,
            issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            /*
              The days billed, as the client is told them — kept rather than
              re-derived from the lines, because a quiet fortnight gathers
              nothing and an invoice must not then claim a different period
              than the one it was raised for.
            */
            servicePeriodFrom: dayStart(data.servicePeriodFrom) ?? undefined,
            servicePeriodTo: dayEnd(data.servicePeriodTo) ?? undefined,
            notes: data.notes,
            organizationId: data.organizationId,
            createdById: data.createdById,
            items: {
              create: items,
            },
          },
          include: {
            items: true,
            createdBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        });
        break;
      } catch (err: any) {
        // P2002 = another request grabbed this number first; retry with the next.
        if (err?.code === 'P2002' && attempt < 4) continue;
        throw err;
      }
    }

    return { success: true, data: invoice };
  }

  async findAll(query: {
    organizationId: string;
    status?: string;
    spaceId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 200);
    const skip = (page - 1) * limit;

    const where: any = { organizationId: query.organizationId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.spaceId) {
      where.spaceId = query.spaceId;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginated(invoices, { page, limit, total });
  }

  async findOne(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!invoice) {
      return {
        success: false,
        message: 'Invoice not found',
        statusCode: HttpStatus.NOT_FOUND,
      };
    }

    return { success: true, data: { ...invoice, documentLocale: await this.documentLocale(invoice) } };
  }

  /**
   * Which language the client's copy of this invoice is written in.
   *
   * The PDF is drawn in the browser, but the browser cannot answer this: it is
   * the rule every client email follows (`clientDocumentLocale` in shared — the
   * account behind the address, the client record's language, the
   * organization's country, English), and it reads records the office screen
   * does not load. So it is decided HERE and sent as one field, and the office
   * may still pick another language for a download.
   *
   * On the single invoice only. The list does not carry it: nobody downloads a
   * PDF from a list row, and a lookup per row is what this must never become.
   *
   * ⚠️ A failed lookup costs the language, never the invoice — the page falls
   * back to English rather than failing to open.
   */
  private async documentLocale(invoice: { organizationId: string; clientEmail: string | null }): Promise<SupportedLocale> {
    try {
      return await clientDocumentLocale(this.prisma, invoice.organizationId, { email: invoice.clientEmail });
    } catch (err) {
      this.logger.warn(`Could not look up a language for an invoice: ${(err as Error).message}`);
      return DEFAULT_LOCALE;
    }
  }

  async update(
    id: string,
    organizationId: string,
    data: {
      clientName?: string;
      clientEmail?: string;
      clientAddress?: string;
      currency?: string;
      taxRate?: number;
      discount?: number;
      issueDate?: string;
      dueDate?: string;
      servicePeriodFrom?: string | null;
      servicePeriodTo?: string | null;
      notes?: string;
    },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
    });

    if (!invoice) {
      return {
        success: false,
        message: 'Invoice not found',
        statusCode: HttpStatus.NOT_FOUND,
      };
    }

    if (invoice.status !== 'DRAFT') {
      return {
        success: false,
        message: 'Only draft invoices can be updated',
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    const updateData: any = {};
    if (data.clientName !== undefined) updateData.clientName = data.clientName;
    if (data.clientEmail !== undefined) updateData.clientEmail = data.clientEmail;
    if (data.clientAddress !== undefined) updateData.clientAddress = data.clientAddress;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.issueDate !== undefined) updateData.issueDate = new Date(data.issueDate);
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
    // Null clears the period back to "everything outstanding" — a real answer,
    // so it has to be distinguishable from "not mentioned in this request".
    if (data.servicePeriodFrom !== undefined) updateData.servicePeriodFrom = dayStart(data.servicePeriodFrom);
    if (data.servicePeriodTo !== undefined) updateData.servicePeriodTo = dayEnd(data.servicePeriodTo);

    // If taxRate or discount changed, recalculate totals
    if (data.taxRate !== undefined || data.discount !== undefined) {
      const taxRate = data.taxRate ?? invoice.taxRate ?? 0;
      const discount = data.discount ?? invoice.discount;
      const taxAmount = invoice.subtotal * taxRate;
      const total = invoice.subtotal + taxAmount - discount;

      updateData.taxRate = taxRate;
      updateData.discount = discount;
      updateData.taxAmount = taxAmount;
      updateData.total = total;
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return { success: true, data: updated };
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
    });

    if (!invoice) {
      return {
        success: false,
        message: 'Invoice not found',
        statusCode: HttpStatus.NOT_FOUND,
      };
    }

    /*
      THE LIFE OF AN INVOICE.

        DRAFT ──issue──▶ ISSUED ──mark as sent──▶ SENT ──mark paid──▶ PAID
          ▲                │
          └──back to draft─┘

      ⚠️ ISSUED is the step that was missing, and its absence forced a lie. A
      draft's PDF carries a DRAFT watermark — correctly, since nobody should pay
      or file a draft — so the only way to get a clean document to send was to
      mark it SENT before sending it. That recorded a delivery that had not
      happened and locked the invoice in the same click.

      ⚠️ ISSUED → DRAFT is the ONLY backward step in the whole table, and it is
      deliberate: at that point the document is final but nothing has left the
      building, so unlocking it costs nobody anything. It is also what makes
      issuing safe to press — the complaint about the old flow was an
      irreversible action behind a one-click button with no warning.

      ⚠️ Once SENT there is no way back. A customer is holding it; the remedy
      for a wrong invoice is a credit note or a cancellation, never a quiet
      rewrite of a document somebody has already filed.

      ⚠️ DRAFT → SENT is gone. Anything that still asks for it is code written
      against the old flow, and should be issuing instead.
    */
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['ISSUED', 'CANCELED'],
      ISSUED: ['DRAFT', 'SENT', 'CANCELED'],
      SENT: ['PAID', 'OVERDUE', 'CANCELED'],
      OVERDUE: ['PAID', 'CANCELED'],
      PAID: ['REFUNDED'],
    };

    const allowed = validTransitions[invoice.status] || [];
    if (!allowed.includes(status)) {
      return {
        success: false,
        message: `Cannot transition from ${invoice.status} to ${status}`,
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    const updateData: any = { status };
    if (status === 'PAID') {
      updateData.paidAt = new Date();
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return { success: true, data: updated };
  }

  async delete(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
    });

    if (!invoice) {
      return {
        success: false,
        message: 'Invoice not found',
        statusCode: HttpStatus.NOT_FOUND,
      };
    }

    if (invoice.status !== 'DRAFT') {
      return {
        success: false,
        message: 'Only draft invoices can be deleted',
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    await this.prisma.invoice.delete({ where: { id } });

    return { success: true, message: 'Invoice deleted' };
  }

  async addItem(
    invoiceId: string,
    organizationId: string,
    item: {
      description: string;
      quantity?: number;
      unitPrice?: number;
      taskId?: string | null;
      reportId?: string | null;
      lineKind?: 'HOURS' | 'DAYS' | 'HEADING' | null;
      billedDays?: number | null;
      workerId?: string | null;
      dayFrom?: string | null;
      dayTo?: string | null;
    },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });

    if (!invoice) {
      return {
        success: false,
        message: 'Invoice not found',
        statusCode: HttpStatus.NOT_FOUND,
      };
    }

    if (invoice.status !== 'DRAFT') {
      return {
        success: false,
        message: 'Can only add items to draft invoices',
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    const quantity = item.quantity ?? 1;
    const unitPrice = item.unitPrice ?? 0;
    const amount = quantity * unitPrice;
    // A re-added line keeps which job and which days it covers (cleaned, as on create).
    const dayFields = this.dayLineFields(item);
    const badWorker = await this.unknownWorker(organizationId, [dayFields]);
    if (badWorker) return badWorker;

    await this.prisma.invoiceItem.create({
      data: {
        invoiceId,
        description: item.description,
        quantity,
        unitPrice,
        amount,
        taskId: item.taskId ?? undefined,
        reportId: item.reportId ?? undefined,
        ...dayFields,
      },
    });

    return this.recalculateAndReturn(invoiceId);
  }

  async removeItem(
    invoiceId: string,
    itemId: string,
    organizationId: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });

    if (!invoice) {
      return {
        success: false,
        message: 'Invoice not found',
        statusCode: HttpStatus.NOT_FOUND,
      };
    }

    if (invoice.status !== 'DRAFT') {
      return {
        success: false,
        message: 'Can only remove items from draft invoices',
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    const existingItem = await this.prisma.invoiceItem.findFirst({
      where: { id: itemId, invoiceId },
    });

    if (!existingItem) {
      return {
        success: false,
        message: 'Invoice item not found',
        statusCode: HttpStatus.NOT_FOUND,
      };
    }

    await this.prisma.invoiceItem.delete({ where: { id: itemId } });

    return this.recalculateAndReturn(invoiceId);
  }

  private async recalculateAndReturn(invoiceId: string) {
    const items = await this.prisma.invoiceItem.findMany({
      where: { invoiceId },
    });

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    const taxRate = invoice!.taxRate ?? 0;
    const discount = invoice!.discount;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount - discount;

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { subtotal, taxAmount, total },
      include: {
        items: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return { success: true, data: updated };
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
  async gather(data: {
    organizationId: string;
    spaceId?: string;
    customerId?: string;
    /** Service period — inclusive, `YYYY-MM-DD`. Either end may be omitted. */
    from?: string;
    to?: string;
  }) {
    if (!data.spaceId && !data.customerId) {
      return {
        success: false,
        message: 'Choose a workspace or a client to gather work from',
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }
    if (data.spaceId && data.customerId) {
      // Two sources would silently intersect — and an empty result then reads
      // as "nothing to bill" when it means "these two do not overlap".
      return {
        success: false,
        message: 'Gather from a workspace or a client, not both',
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    const space = data.spaceId
      ? await this.prisma.companyLocation.findFirst({
          where: { id: data.spaceId, organizationId: data.organizationId },
          select: {
            id: true,
            name: true,
            kind: true,
            contactName: true,
            contactEmail: true,
            address: true,
            billableRateCents: true,
            costRateCents: true,
            timezone: true,
          },
        })
      : null;
    if (data.spaceId && !space) {
      return { success: false, message: 'Space not found', statusCode: HttpStatus.NOT_FOUND };
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
        success: false,
        message: `${space.name} is not a customer workspace, so it cannot be invoiced`,
        statusCode: HttpStatus.BAD_REQUEST,
      };
    }

    const customer = data.customerId
      ? await this.prisma.customer.findFirst({
          where: { id: data.customerId, organizationId: data.organizationId },
          select: { id: true, name: true, email: true, address: true },
        })
      : null;
    if (data.customerId && !customer) {
      return { success: false, message: 'Client not found', statusCode: HttpStatus.NOT_FOUND };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { billableRateCents: true, costRateCents: true },
    });
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
      select: {
        id: true,
        title: true,
        updatedAt: true,
        assignedTo: {
          select: {
            id: true, firstName: true, lastName: true,
            billRateCents: true, costRateCents: true,
          },
        },
        serviceReport: {
          select: {
            id: true,
            summary: true,
            workPerformed: true,
            workDuration: true,
            completedAt: true,
            completedBy: {
              select: {
                id: true, firstName: true, lastName: true,
                billRateCents: true, costRateCents: true,
              },
            },
            partsUsed: {
              select: { name: true, partNumber: true, quantity: true, unitCost: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    // Exclude tasks already billed on a live invoice (any status except CANCELED).
    const taskIds = tasks.map((t) => t.id);
    const alreadyBilled = taskIds.length
      ? await this.prisma.invoiceItem.findMany({
          where: {
            taskId: { in: taskIds },
            invoice: { organizationId: data.organizationId, status: { not: 'CANCELED' } },
          },
          select: { taskId: true },
        })
      : [];
    const billed = new Set(alreadyBilled.map((i) => i.taskId).filter(Boolean) as string[]);

    const fullName = (u?: { firstName: string | null; lastName: string | null } | null) =>
      u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null;

    /*
      Everybody who works HERE: their assignment carries the top rung of the rate
      ladder, their trade (work role) and how they are billed. Loaded for the
      whole workspace — not only the people on a job — because somebody billed
      by the day may have worked every day of the month and closed no job.
      One query; the space has tens of members, not thousands.
    */
    const workerIds = Array.from(
      new Set(
        tasks
          .flatMap((t) => [t.serviceReport?.completedBy?.id, t.assignedTo?.id])
          .filter((id): id is string => !!id),
      ),
    );
    const assignments = space
      ? await this.prisma.spaceAssignment.findMany({
          where: { spaceId: space.id, organizationId: data.organizationId },
          select: {
            id: true,
            userId: true,
            billRateCents: true,
            costRateCents: true,
            billBy: true,
            workRole: { select: { id: true, name: true, kind: true } },
            user: { select: { id: true, firstName: true, lastName: true, billRateCents: true, costRateCents: true, isExternal: true } },
          },
        })
      : [];
    const assignmentOf = new Map(assignments.map((a) => [a.userId, a]));
    // How each person here is billed — their own choice on the assignment.
    const billByOf = (userId?: string | null): BillByValue => {
      const a = userId ? assignmentOf.get(userId) : undefined;
      return effectiveBillBy((a?.billBy as BillByValue | null) ?? null);
    };

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
    const tz = space?.timezone || 'UTC';

    /*
      ⚠️ ONE resolver, shared with the screen and the phone. The order of the
      four levels is written down exactly once, in `resolveRate` — a second copy
      here would be a second answer to "why is this €40", and the first person
      to find them disagreeing is looking at an invoice that is already wrong.
    */
    const ratesFor = (
      worker: { billRateCents?: number | null; costRateCents?: number | null; id?: string } | null,
      day: string,
    ) => {
      const a = worker?.id ? assignmentOf.get(worker.id) : undefined;
      const at = (target: 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT', id: string | undefined, kind: 'BILL_HOUR' | 'COST_HOUR', column: number | null | undefined) =>
        book.on(day, target, id, kind, column ?? null);
      return snapshotRates({
        contract: a
          ? { billRateCents: at('ASSIGNMENT', a.id, 'BILL_HOUR', a.billRateCents), costRateCents: at('ASSIGNMENT', a.id, 'COST_HOUR', a.costRateCents) }
          : null,
        member: worker?.id
          ? { billRateCents: at('MEMBER', worker.id, 'BILL_HOUR', worker.billRateCents), costRateCents: at('MEMBER', worker.id, 'COST_HOUR', worker.costRateCents) }
          : null,
        client: space
          ? { billRateCents: at('SPACE', space.id, 'BILL_HOUR', space.billableRateCents), costRateCents: at('SPACE', space.id, 'COST_HOUR', space.costRateCents) }
          : null,
        organization: {
          billRateCents: at('ORGANIZATION', data.organizationId, 'BILL_HOUR', org?.billableRateCents),
          costRateCents: at('ORGANIZATION', data.organizationId, 'COST_HOUR', org?.costRateCents),
        },
      });
    };

    const workEntries: any[] = [];
    const workerHours = new Map<string, { name: string; hours: number }>();

    for (const t of tasks) {
      if (billed.has(t.id)) continue;
      const report = t.serviceReport;
      const worker = report?.completedBy ?? t.assignedTo ?? null;
      const workerName = fullName(worker);
      const hours = jobHours(report);
      const parts = (report?.partsUsed ?? []).map((p) => ({
        name: p.name,
        partNumber: p.partNumber ?? null,
        quantity: p.quantity ?? 1,
        unitCost: p.unitCost ?? 0,
        amount: (p.quantity ?? 1) * (p.unitCost ?? 0),
      }));

      /*
        The rate THIS person is billed at, ON THE DAY the job was done — not one
        rate for the job, and not today's rate.
      */
      const workedOn = dayKeyIn(report?.completedAt ?? t.updatedAt, tz);
      const resolved = ratesFor(worker, workedOn);
      const billRate = resolved.billRateCents != null ? resolved.billRateCents / 100 : rate;
      const a = worker?.id ? assignmentOf.get(worker.id) : undefined;
      const workRole = a?.workRole?.kind === 'WORK' ? a.workRole : null;
      const billBy = billByOf(worker?.id);

      workEntries.push({
        taskId: t.id,
        taskTitle: t.title,
        reportId: report?.id ?? null,
        workerId: worker?.id ?? null,
        workerName,
        hours,
        billRateCents: resolved.billRateCents,
        costRateCents: resolved.costRateCents,
        laborAmount: billRate != null && billsHours(billBy) ? Math.round(hours * billRate * 100) / 100 : 0,
        completedAt: report?.completedAt ?? t.updatedAt ?? null,
        workedOn,
        workRoleId: workRole?.id ?? null,
        workRoleName: workRole?.name ?? null,
        billBy,
        // Day-only: listed (and so marked billed) but not charged — the days pay for it.
        hoursBillable: billsHours(billBy),
        notes: report?.workPerformed || report?.summary || null,
        parts,
        hasReport: !!report,
      });

      if (worker?.id && hours > 0) {
        const prev = workerHours.get(worker.id) ?? { name: workerName ?? 'Worker', hours: 0 };
        prev.hours = Math.round((prev.hours + hours) * 100) / 100;
        workerHours.set(worker.id, prev);
      }
    }

    const dayEntries = space ? await this.gatherDays(data.organizationId, space.id, tz, data.from, data.to, assignments, billByOf, book) : [];
    return {
      success: true,
      data: {
        spaceId: space?.id ?? null,
        customerId: customer?.id ?? null,
        clientName: space ? space.contactName || space.name : customer!.name,
        clientEmail: (space ? space.contactEmail : customer!.email) ?? null,
        clientAddress: (space ? space.address : customer!.address) ?? null,
        currency: 'EUR',
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
        twoRates: usesTwoRates([
          { billRateCents: org?.billableRateCents, costRateCents: org?.costRateCents },
          space ? { billRateCents: space.billableRateCents, costRateCents: space.costRateCents } : null,
          ...workEntries.map((w: any) => ({ costRateCents: w.costRateCents })),
        ]),
        workEntries,
      },
    };
  }

  /**
   * The day-line fields of one incoming item, cleaned.
   *
   * ⚠️ NOT TRUSTED: these arrive from a browser. A kind outside the three is
   * dropped; days are bounded; the run's days must be real calendar days in
   * order. Only a DAYS line keeps the worker and the run — on any other line
   * they would mark days as billed that nobody billed.
   */
  private dayLineFields(item: {
    lineKind?: string | null;
    billedDays?: number | null;
    workerId?: string | null;
    dayFrom?: string | null;
    dayTo?: string | null;
  }) {
    const lineKind = item.lineKind && LINE_KINDS.has(item.lineKind) ? (item.lineKind as 'HOURS' | 'DAYS' | 'HEADING') : null;
    const isDays = lineKind === 'DAYS';
    const from = isDays ? parseDayKey(item.dayFrom) : null;
    const to = isDays ? parseDayKey(item.dayTo) : null;
    return {
      lineKind,
      billedDays:
        isDays && typeof item.billedDays === 'number' && Number.isFinite(item.billedDays) && item.billedDays >= 0
          ? Math.min(item.billedDays, 3_660)
          : null,
      workerId: isDays && typeof item.workerId === 'string' ? item.workerId : null,
      dayFrom: from ? new Date(`${from}T00:00:00Z`) : null,
      dayTo: from && to && to >= from ? new Date(`${to}T00:00:00Z`) : from ? new Date(`${from}T00:00:00Z`) : null,
    };
  }

  /**
   * A DAYS line may only name somebody in THIS organization — otherwise a
   * crafted request could mark another tenant's days as billed. One query.
   */
  private async unknownWorker(organizationId: string, items: Array<{ workerId: string | null }>) {
    const ids = [...new Set(items.map((i) => i.workerId).filter((x): x is string => !!x))];
    if (ids.length === 0) return null;
    const found = await this.prisma.user.count({ where: { id: { in: ids }, organizationId } });
    return found === ids.length
      ? null
      : { success: false as const, message: 'A day line names somebody outside this organization', statusCode: HttpStatus.BAD_REQUEST };
  }

  /**
   * Days worked at a workspace by the people billed by the day, priced per day.
   *
   * ⚠️ A DAY WORKED IS ANY DAY THEY CLOCKED IN HERE OR FINISHED A JOB HERE —
   * read in the workspace's own time zone, with no minimum hours, once per day
   * however many shifts or jobs. A clock-in a manager REJECTED is not a day.
   * Finished jobs count too, so somebody who forgot to clock in but did the
   * work is not silently a day short.
   *
   * ⚠️ NEVER BILLED TWICE. Every DAYS line on a live invoice records whose days
   * and which run (`workerId`, `dayFrom`–`dayTo`); those days are skipped here,
   * the way a job on a live invoice is skipped by its `taskId`. Cancelling the
   * invoice releases them.
   *
   * Three queries for the whole workspace, whatever its size.
   */
  private async gatherDays(
    organizationId: string,
    spaceId: string,
    tz: string,
    from: string | undefined,
    to: string | undefined,
    assignments: Array<{
      userId: string;
      workRole: { id: string; name: string; kind: string } | null;
      user: { id: string; firstName: string | null; lastName: string | null; isExternal: boolean } | null;
    }>,
    billByOf: (userId: string) => BillByValue,
    book: Awaited<ReturnType<typeof loadRateBook>>,
  ): Promise<DayEntry[]> {
    const byDay = assignments.filter(
      (a) => a.workRole?.kind === 'WORK' && !a.user?.isExternal && billsDays(billByOf(a.userId)),
    );
    if (byDay.length === 0) return [];
    const ids = byDay.map((a) => a.userId);
    const fromDay = parseDayKey(from);
    const toDay = parseDayKey(to);
    // A day of slack each side: the period is in the workspace's zone, the column is UTC.
    const DAY_MS = 86_400_000;
    const clockInAt = {
      ...(fromDay && { gte: new Date(Date.parse(`${fromDay}T00:00:00Z`) - DAY_MS) }),
      ...(toDay && { lte: new Date(Date.parse(`${toDay}T23:59:59.999Z`) + DAY_MS) }),
    };

    const jobRange = {
      ...(fromDay && { gte: new Date(Date.parse(`${fromDay}T00:00:00Z`) - DAY_MS) }),
      ...(toDay && { lte: new Date(Date.parse(`${toDay}T23:59:59.999Z`) + DAY_MS) }),
    };
    const [entries, billedRuns, jobs] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          organizationId,
          locationId: spaceId,
          userId: { in: ids },
          approvalStatus: { not: 'REJECTED' },
          ...(fromDay || toDay ? { clockInAt } : {}),
        },
        select: { userId: true, clockInAt: true },
      }),
      this.prisma.invoiceItem.findMany({
        where: {
          lineKind: 'DAYS',
          workerId: { in: ids },
          invoice: { organizationId, spaceId, status: { not: 'CANCELED' } },
        },
        select: { workerId: true, dayFrom: true, dayTo: true },
      }),
      // Every finished job here by these people — billed or not, a day worked is a day worked.
      this.prisma.task.findMany({
        where: {
          organizationId,
          spaceId,
          status: FINISHED,
          OR: [
            { serviceReport: { completedById: { in: ids }, ...(fromDay || toDay ? { completedAt: jobRange } : {}) } },
            { serviceReport: null, assignedToId: { in: ids }, ...(fromDay || toDay ? { updatedAt: jobRange } : {}) },
          ],
        },
        select: { assignedToId: true, updatedAt: true, serviceReport: { select: { completedById: true, completedAt: true } } },
      }),
    ]);
    const jobDays = jobs.map((j) => ({
      userId: j.serviceReport?.completedById ?? j.assignedToId,
      clockInAt: j.serviceReport?.completedAt ?? j.updatedAt,
    }));

    const key = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const out: DayEntry[] = [];
    for (const a of byDay) {
      const runs = billedRuns.filter((r) => r.workerId === a.userId);
      const days = workedDays(
        [...entries, ...jobDays].filter((e) => e.userId === a.userId),
        (at) => dayKeyIn(at, tz),
        fromDay,
        toDay,
      ).filter((d) => !runs.some((r) => key(r.dayFrom)! <= d && d <= (key(r.dayTo) ?? key(r.dayFrom))!));
      if (days.length === 0) continue;
      const name = `${a.user?.firstName ?? ''} ${a.user?.lastName ?? ''}`.trim() || 'Worker';
      // This workspace's day rate on each day, else the role's default.
      const roleId = a.workRole!.id;
      for (const run of book.splitDaysWith(days, (d) => book.dayRateOn(d, roleId, spaceId))) {
        out.push({
          workerId: a.userId,
          workerName: name,
          workRoleId: a.workRole!.id,
          workRoleName: a.workRole!.name,
          days: run.days,
          fromDay: run.fromDay,
          toDay: run.toDay,
          dayRateCents: run.cents,
        });
      }
    }
    return out;
  }

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        organizationId,
        invoiceNumber: { startsWith: prefix },
      },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let nextSeq = 1;
    if (lastInvoice) {
      const lastSeq = parseInt(lastInvoice.invoiceNumber.slice(prefix.length), 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }
}
