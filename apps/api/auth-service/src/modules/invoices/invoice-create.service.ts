import { Injectable, HttpStatus } from '@nestjs/common';
import { cleanRateCents, currencyOrNull, invoiceTotals, lineAmount, PERSON_BRIEF_SELECT } from '@hbcfield/shared';
import { dayStart, dayEnd, invoiceDay } from './work-source';
import { InvoiceServiceBase } from './invoice-service.base';

/** Creating an invoice: its lines, its company, its number. */
@Injectable()
export class InvoiceCreateService extends InvoiceServiceBase {
  async create(data: {
    organizationId: string;
    createdById: string;
    spaceId?: string;
    /** The company that issues it; omitted = the workspace's → the client's → the main one. */
    legalEntityId?: string | null;
    /** The client being billed outside a workspace — only so its company can issue it. */
    customerId?: string | null;
    clientName?: string;
    clientEmail?: string;
    clientAddress?: string;
    currency?: string;
    /** 1 {currency} = exchangeRate {the organization's}; null clears, omitted asks the ECB. */
    exchangeRate?: number | string | null;
    exchangeRateSource?: string | null;
    exchangeRateDate?: string | null;
    /** The HOURS / DAYS tag before each labour line (default shown). */
    showLineTags?: boolean;
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
      taskIds?: string[];
      hoursBasis?: string | null;
    }[];
  }) {
    // When tied to a CUSTOMER space, snapshot its contact details as fallbacks so
    // the invoice stays stable even if the space changes later.
    let clientName = data.clientName;
    let clientEmail = data.clientEmail;
    let clientAddress = data.clientAddress;
    let spaceCurrencyValue: string | null = null;
    let spaceEntityId: string | null = null;
    let spaceCustomerId: string | null = null;
    // Only a workspace the org-scoped lookup FOUND is written onto the invoice —
    // an id from another tenant must not become this invoice's workspace.
    let foundSpaceId: string | null = null;
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId },
        select: { name: true, contactName: true, contactEmail: true, address: true, currency: true, legalEntityId: true, sourceCustomerId: true },
      });
      spaceCurrencyValue = space?.currency ?? null;
      spaceEntityId = space?.legalEntityId ?? null;
      spaceCustomerId = space?.sourceCustomerId ?? null;
      if (space) {
        foundSpaceId = data.spaceId;
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
        // Rounded to the cent on its own — the subtotal is the sum of these (invoice-totals.ts).
        amount: lineAmount(quantity, unitPrice),
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
    const badRef = await this.unknownWorkRef(data.organizationId, items);
    if (badRef) return badRef;

    // Who issues it — resolved once and stored, so the number series and the paper agree.
    const issuer = await this.issuingEntity(
      data.organizationId,
      data.legalEntityId,
      spaceEntityId,
      spaceCustomerId ?? (typeof data.customerId === 'string' ? data.customerId : null),
    );
    if ('error' in issuer) return issuer.error;

    // The currency: what the screen sent, else the workspace's, else the company's, else the organization's.
    const money = await this.currencyFields(data.organizationId, data, currencyOrNull(spaceCurrencyValue) ?? currencyOrNull(issuer.entity.currency));
    if ('error' in money) return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: money.error };

    // ONE rule with the draft screen: rounded lines summed, VAT on the subtotal.
    const taxRate = data.taxRate ?? 0;
    const discount = data.discount ?? 0;
    const { subtotal, taxAmount, total } = invoiceTotals(items, taxRate, discount);

    // Invoice-number generation is read-then-write, so two concurrent creates can
    // pick the same sequence. @@unique([organizationId, invoiceNumber]) makes the
    // collision loud (P2002) instead of silently duplicating; retry a few times,
    // re-reading the latest number each pass, before surfacing the error.
    const defaultIssueDay = await this.todayFor(data.organizationId, foundSpaceId);
    let invoice;
    for (let attempt = 0; ; attempt++) {
      const invoiceNumber = await this.generateInvoiceNumber(data.organizationId, issuer.entity.invoicePrefix);
      try {
        invoice = await this.prisma.invoice.create({
          data: {
            invoiceNumber,
            spaceId: foundSpaceId,
            legalEntityId: issuer.entity.id,
            clientName,
            clientEmail,
            clientAddress,
            ...money,
            showLineTags: data.showLineTags !== false,
            taxRate,
            discount,
            subtotal,
            taxAmount,
            total,
            // Calendar DATES, stored as the start of that day in UTC (read back by their UTC date).
            issueDate: invoiceDay(data.issueDate) ?? dayStart(defaultIssueDay)!,
            dueDate: invoiceDay(data.dueDate) ?? undefined,
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
              select: PERSON_BRIEF_SELECT,
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
}
