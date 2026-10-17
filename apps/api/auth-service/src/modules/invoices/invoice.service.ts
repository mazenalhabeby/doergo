import type { Prisma, InvoiceStatus } from '@prisma/client';
import { Injectable, HttpStatus } from '@nestjs/common';
import {
  paginated,
  clientDocumentLocale,
  DEFAULT_LOCALE,
  type SupportedLocale,
  parseCurrency,
  CURRENCY_INVALID_MESSAGE,
  PERSON_BRIEF_SELECT,
} from '@hbcfield/shared';
import { InvoiceServiceBase } from './invoice-service.base';

@Injectable()
export class InvoiceService extends InvoiceServiceBase {
  /** `1 {currency} = rate {the organization's}` on a day, for the invoice screen. */
  async exchangeRate(data: { organizationId: string; currency: string; date?: string }) {
    const parsed = parseCurrency(data.currency);
    if (!parsed.ok || !parsed.currency)
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: CURRENCY_INVALID_MESSAGE };
    const base = await this.organizationCurrency(data.organizationId);
    const day =
      data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : await this.todayFor(data.organizationId);
    const answer = await this.rates.rate(parsed.currency, base, day);
    return {
      success: true,
      data: { from: parsed.currency, to: base, ...(answer ?? { rate: null, date: null, source: null }) },
    };
  }

  async findAll(query: {
    organizationId: string;
    status?: string;
    spaceId?: string;
    legalEntityId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 200);
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = { organizationId: query.organizationId };
    if (query.status) {
      // A filter from the query string; Prisma refuses a value that is not a status (as it always did).
      where.status = query.status as InvoiceStatus;
    }
    if (query.spaceId) {
      where.spaceId = query.spaceId;
    }
    if (query.legalEntityId) {
      where.legalEntityId = query.legalEntityId;
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
            select: PERSON_BRIEF_SELECT,
          },
          legalEntity: { select: { id: true, legalName: true, label: true } },
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
          select: PERSON_BRIEF_SELECT,
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

    return {
      success: true,
      data: { ...invoice, issuer: await this.issuerFor(invoice), documentLocale: await this.documentLocale(invoice) },
    };
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
  private async documentLocale(invoice: {
    organizationId: string;
    clientEmail: string | null;
  }): Promise<SupportedLocale> {
    try {
      return await clientDocumentLocale(this.prisma, invoice.organizationId, { email: invoice.clientEmail });
    } catch (err) {
      this.logger.warn(`Could not look up a language for an invoice: ${(err as Error).message}`);
      return DEFAULT_LOCALE;
    }
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
}
