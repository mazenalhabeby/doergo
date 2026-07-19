import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '@hbcfield/shared';

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    createdById: string;
    clientName: string;
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
            clientName: data.clientName,
            clientEmail: data.clientEmail,
            clientAddress: data.clientAddress,
            currency: data.currency ?? 'USD',
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
