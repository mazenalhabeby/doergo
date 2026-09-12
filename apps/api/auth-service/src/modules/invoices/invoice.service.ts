import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '@hbcfield/shared';

@Injectable()
export class InvoiceService {
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
    notes?: string;
    items?: {
      description: string;
      quantity?: number;
      unitPrice?: number;
      taskId?: string;
      reportId?: string;
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
      };
    });

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

    return { success: true, data: invoice };
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

    const validTransitions: Record<string, string[]> = {
      DRAFT: ['SENT', 'CANCELED'],
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
      taskId?: string;
      reportId?: string;
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

    await this.prisma.invoiceItem.create({
      data: {
        invoiceId,
        description: item.description,
        quantity,
        unitPrice,
        amount,
        taskId: item.taskId,
        reportId: item.reportId,
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
  async gather(data: { organizationId: string; spaceId?: string; customerId?: string }) {
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
      select: { billableRateCents: true },
    });
    /*
      A client has no rate of its own, so it falls to the organization's. That is
      the honest answer rather than nothing: the form shows the rate and the
      biller changes it, and a blank costs them a lookup they should not need.
    */
    const rateCents = space?.billableRateCents ?? org?.billableRateCents ?? null;
    const rate = rateCents != null ? rateCents / 100 : null; // currency units/hour

    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: data.organizationId,
        ...(space ? { spaceId: space.id } : { customerId: customer!.id }),
        status: { in: ['COMPLETED', 'CLOSED'] },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        serviceReport: {
          select: {
            id: true,
            summary: true,
            workPerformed: true,
            workDuration: true,
            completedAt: true,
            completedBy: { select: { id: true, firstName: true, lastName: true } },
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

    const workEntries: any[] = [];
    const workerHours = new Map<string, { name: string; hours: number }>();

    for (const t of tasks) {
      if (billed.has(t.id)) continue;
      const report = t.serviceReport;
      const worker = report?.completedBy ?? t.assignedTo ?? null;
      const workerName = fullName(worker);
      const hours =
        report && report.workDuration > 0
          ? Math.round((report.workDuration / 3600) * 100) / 100
          : 0;
      const parts = (report?.partsUsed ?? []).map((p) => ({
        name: p.name,
        partNumber: p.partNumber ?? null,
        quantity: p.quantity ?? 1,
        unitCost: p.unitCost ?? 0,
        amount: (p.quantity ?? 1) * (p.unitCost ?? 0),
      }));

      workEntries.push({
        taskId: t.id,
        taskTitle: t.title,
        reportId: report?.id ?? null,
        workerId: worker?.id ?? null,
        workerName,
        hours,
        laborAmount: rate != null ? Math.round(hours * rate * 100) / 100 : 0,
        completedAt: report?.completedAt ?? t.updatedAt ?? null,
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
        workEntries,
      },
    };
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
