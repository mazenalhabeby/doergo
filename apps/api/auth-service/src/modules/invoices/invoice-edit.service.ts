import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { invoiceNumberPrefix, invoiceTotalsFromSubtotal, PERSON_BRIEF_SELECT } from '@hbcfield/shared';
import { dayStart, dayEnd, invoiceDay } from './work-source';
import { InvoiceServiceBase } from './invoice-service.base';

/** Changing an invoice: its fields, and its state (draft, issued, sent, paid, cancelled). */
@Injectable()
export class InvoiceEditService extends InvoiceServiceBase {
  async update(
    id: string,
    organizationId: string,
    data: {
      clientName?: string;
      clientEmail?: string;
      clientAddress?: string;
      currency?: string;
      exchangeRate?: number | string | null;
      exchangeRateSource?: string | null;
      exchangeRateDate?: string | null;
      showLineTags?: boolean;
      taxRate?: number;
      discount?: number;
      issueDate?: string;
      dueDate?: string;
      servicePeriodFrom?: string | null;
      servicePeriodTo?: string | null;
      notes?: string;
      /** Another company issues this draft; null = back to the workspace's / client's / main one. */
      legalEntityId?: string | null;
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
    // Currency or its rate changed (or the issue day, which the ECB rate follows
    // when nobody typed one): work the pair out again, through the same rule.
    const ratesFollowDay =
      data.issueDate !== undefined && invoice.exchangeRateSource !== 'MANUAL' && data.exchangeRate === undefined;
    if (data.currency !== undefined || data.exchangeRate !== undefined || ratesFollowDay) {
      const money = await this.currencyFields(
        organizationId,
        {
          ...data,
          issueDate: data.issueDate ?? invoice.issueDate,
        },
        invoice.currency,
      );
      if ('error' in money) return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: money.error };
      Object.assign(updateData, money);
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (typeof data.showLineTags === 'boolean') updateData.showLineTags = data.showLineTags;
    if (data.issueDate !== undefined) updateData.issueDate = invoiceDay(data.issueDate) ?? invoice.issueDate;
    if (data.dueDate !== undefined) updateData.dueDate = invoiceDay(data.dueDate);
    // Null clears the period back to "everything outstanding" — a real answer,
    // so it has to be distinguishable from "not mentioned in this request".
    if (data.servicePeriodFrom !== undefined) updateData.servicePeriodFrom = dayStart(data.servicePeriodFrom);
    if (data.servicePeriodTo !== undefined) updateData.servicePeriodTo = dayEnd(data.servicePeriodTo);

    // If taxRate or discount changed, recalculate totals
    if (data.taxRate !== undefined || data.discount !== undefined) {
      const taxRate = data.taxRate ?? invoice.taxRate ?? 0;
      const discount = data.discount ?? invoice.discount;
      const { taxAmount, total } = invoiceTotalsFromSubtotal(invoice.subtotal, taxRate, discount);

      updateData.taxRate = taxRate;
      updateData.discount = discount;
      updateData.taxAmount = taxAmount;
      updateData.total = total;
    }

    // Another company: a draft takes the new company's number series. An issued number never changes.
    let renumber: string | null = null;
    if (data.legalEntityId !== undefined) {
      const space = invoice.spaceId
        ? await this.prisma.companyLocation.findFirst({
            where: { id: invoice.spaceId, organizationId },
            select: { legalEntityId: true, sourceCustomerId: true },
          })
        : null;
      const issuer = await this.issuingEntity(
        organizationId,
        data.legalEntityId,
        space?.legalEntityId ?? null,
        space?.sourceCustomerId ?? null,
      );
      if ('error' in issuer) return issuer.error;
      if (issuer.entity.id !== invoice.legalEntityId) {
        updateData.legalEntityId = issuer.entity.id;
        if (
          !invoice.invoiceNumber.startsWith(invoiceNumberPrefix(issuer.entity.invoicePrefix, new Date().getFullYear()))
        ) {
          renumber = issuer.entity.invoicePrefix;
        }
      }
    }

    let updated;
    for (let attempt = 0; ; attempt++) {
      if (renumber !== null) updateData.invoiceNumber = await this.generateInvoiceNumber(organizationId, renumber);
      try {
        updated = await this.prisma.invoice.update({
          where: { id },
          data: updateData,
          include: {
            items: true,
            createdBy: {
              select: PERSON_BRIEF_SELECT,
            },
          },
        });
        break;
      } catch (err: any) {
        if (renumber !== null && err?.code === 'P2002' && attempt < 4) continue;
        throw err;
      }
    }

    return { success: true, data: updated };
  }

  async updateStatus(id: string, organizationId: string, status: string) {
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
    /*
      ⚠️ ISSUING FREEZES THE ISSUER. The company's name, address, tax ids and the bank account the
      client is told to pay are copied onto the invoice, so moving the office next year never
      rewrites a filed document. Back to draft clears it — the draft reads the live company again.
    */
    if (status === 'ISSUED') {
      const live = await this.issuerFor({ ...invoice, issuer: null });
      if (!live) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'COMPANY_MISSING',
          message: 'This invoice has no company to issue it — choose one first.',
        };
      }
      updateData.issuer = live;
      updateData.legalEntityId = live.legalEntityId;
    } else if (status === 'DRAFT') {
      updateData.issuer = Prisma.DbNull;
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
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
