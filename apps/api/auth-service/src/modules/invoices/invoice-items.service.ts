import { Injectable, HttpStatus } from '@nestjs/common';
import { invoiceTotalsFromSubtotalCents, lineAmount, roundCents, PERSON_BRIEF_SELECT } from '@hbcfield/shared';
import { InvoiceServiceBase } from './invoice-service.base';

/** An invoice's lines: adding, removing, and the totals after. */
@Injectable()
export class InvoiceItemsService extends InvoiceServiceBase {
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
      taskIds?: string[];
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
    const amount = lineAmount(quantity, unitPrice);
    // A re-added line keeps which job and which days it covers (cleaned, as on create).
    const dayFields = this.dayLineFields(item);
    const badWorker = await this.unknownWorker(organizationId, [dayFields]);
    if (badWorker) return badWorker;
    const badRef = await this.unknownWorkRef(organizationId, [item]);
    if (badRef) return badRef;

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

  async removeItem(invoiceId: string, itemId: string, organizationId: string) {
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

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    const taxRate = invoice!.taxRate ?? 0;
    const discount = invoice!.discount;
    // Each stored line re-rounded (old rows may hold an unrounded amount), then the one rule.
    const { subtotal, taxAmount, total } = invoiceTotalsFromSubtotalCents(
      items.reduce((sum, item) => sum + roundCents(item.amount * 100), 0),
      taxRate,
      discount,
    );

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { subtotal, taxAmount, total },
      include: {
        items: true,
        createdBy: {
          select: PERSON_BRIEF_SELECT,
        },
      },
    });

    return { success: true, data: updated };
  }
}
