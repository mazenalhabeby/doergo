import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  parseDayKey,
  parseCurrency,
  currencyOrNull,
  parseExchangeRate,
  DEFAULT_CURRENCY,
  CURRENCY_INVALID_MESSAGE,
  EXCHANGE_RATE_INVALID_MESSAGE,
  isHoursBasis,
  nextInvoiceNumber, invoiceNumberPrefix, type IssuerSnapshot,
  toISODateString,
  todayKey,
  workspaceZone,
} from '@hbcfield/shared';
import { ExchangeRateService } from './exchange-rate.service';
import { LegalEntitiesService } from './legal-entities.service';
import { LINE_KINDS } from './invoice-helpers';

/**
 * What every invoice service shares: its dependencies, currencies, today's date,
 * the issuing company and its number series, and the checks on a DAYS line.
 */
@Injectable()
export abstract class InvoiceServiceBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rates: ExchangeRateService,
    protected readonly entities: LegalEntitiesService,
  ) {}

  /** The organization's currency — what costs, statements and margins are in. */
  protected async organizationCurrency(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { currency: true } });
    return currencyOrNull(org?.currency) ?? DEFAULT_CURRENCY;
  }

  /**
   * "Today" for an invoice that names no date — the workspace's day, else the
   * organization's. The UTC day dated an invoice issued at 00:30 in Vienna the
   * day before.
   */
  protected async todayFor(organizationId: string, spaceId?: string | null): Promise<string> {
    return todayKey(await workspaceZone(this.prisma, { organizationId, spaceId }));
  }

  /**
   * The currency and exchange rate an invoice is saved with.
   *
   * ⚠️ FROZEN on the invoice. The rate is what the screen showed (the ECB's for
   * the issue date, or one typed in); when the screen sent none, the server asks
   * the ECB itself. No rate found is saved as none — the margin then reads "—"
   * rather than a number nobody can stand behind.
   */
  protected async currencyFields(
    organizationId: string,
    input: { currency?: string; exchangeRate?: unknown; exchangeRateSource?: string | null; exchangeRateDate?: string | null; issueDate?: string | Date | null },
    fallbackCurrency: string | null,
  ): Promise<
    | { error: string }
    | {
        currency: string;
        baseCurrency: string;
        exchangeRate: number | null;
        exchangeRateSource: string | null;
        exchangeRateDate: Date | null;
      }
  > {
    let currency = fallbackCurrency;
    if (input.currency !== undefined) {
      const parsed = parseCurrency(input.currency);
      if (!parsed.ok || !parsed.currency) return { error: CURRENCY_INVALID_MESSAGE };
      currency = parsed.currency;
    }
    const baseCurrency = await this.organizationCurrency(organizationId);
    currency = currency ?? baseCurrency;
    if (currency === baseCurrency) {
      return { currency, baseCurrency, exchangeRate: null, exchangeRateSource: null, exchangeRateDate: null };
    }
    const typed = parseExchangeRate(input.exchangeRate);
    if (!typed.ok) return { error: EXCHANGE_RATE_INVALID_MESSAGE };
    const issued = input.issueDate ? new Date(input.issueDate) : null;
    const issueDay = issued && !Number.isNaN(issued.getTime()) ? toISODateString(issued) : await this.todayFor(organizationId);
    if (typed.rate != null) {
      const source = input.exchangeRateSource === 'ECB' ? 'ECB' : 'MANUAL';
      const day = input.exchangeRateDate && /^\d{4}-\d{2}-\d{2}$/.test(input.exchangeRateDate) ? input.exchangeRateDate : issueDay;
      return { currency, baseCurrency, exchangeRate: typed.rate, exchangeRateSource: source, exchangeRateDate: new Date(`${day}T00:00:00Z`) };
    }
    if (input.exchangeRate === null) {
      // Cleared on purpose: no margin for this invoice.
      return { currency, baseCurrency, exchangeRate: null, exchangeRateSource: null, exchangeRateDate: null };
    }
    const ecb = await this.rates.rate(currency, baseCurrency, issueDay);
    return {
      currency, baseCurrency,
      exchangeRate: ecb?.rate ?? null,
      exchangeRateSource: ecb ? 'ECB' : null,
      exchangeRateDate: ecb ? new Date(`${ecb.date}T00:00:00Z`) : null,
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
  protected dayLineFields(item: {
    lineKind?: string | null;
    billedDays?: number | null;
    taskIds?: unknown[] | null;
    workerId?: string | null;
    dayFrom?: string | null;
    dayTo?: string | null;
    hoursBasis?: string | null;
  }) {
    const lineKind = item.lineKind && LINE_KINDS.has(item.lineKind) ? (item.lineKind as 'HOURS' | 'DAYS' | 'HEADING') : null;
    const isDays = lineKind === 'DAYS';
    // A run of time on site — hours or days — names whose time and which days.
    const isRun = isDays || (lineKind === 'HOURS' && typeof item.workerId === 'string' && !!item.dayFrom);
    const from = isRun ? parseDayKey(item.dayFrom) : null;
    const to = isRun ? parseDayKey(item.dayTo) : null;
    return {
      lineKind,
      billedDays:
        isDays && typeof item.billedDays === 'number' && Number.isFinite(item.billedDays) && item.billedDays >= 0
          ? Math.min(item.billedDays, 3_660)
          : null,
      workerId: isRun && typeof item.workerId === 'string' ? item.workerId : null,
      taskIds:
        lineKind === 'HOURS' && Array.isArray(item.taskIds)
          ? [...new Set(item.taskIds.filter((x): x is string => typeof x === 'string' && x.length <= 64))].slice(0, 2000)
          : [],
      // Which hours an hours run billed — kept with the line; anything else is no basis.
      hoursBasis: lineKind === 'HOURS' && isRun && isHoursBasis(item.hoursBasis) ? item.hoursBasis : null,
      dayFrom: from ? new Date(`${from}T00:00:00Z`) : null,
      dayTo: from && to && to >= from ? new Date(`${to}T00:00:00Z`) : from ? new Date(`${from}T00:00:00Z`) : null,
    };
  }

  /**
   * A DAYS line may only name somebody in THIS organization — otherwise a
   * crafted request could mark another tenant's days as billed. One query.
   */
  /**
   * Every job and service report a line points at must be this organization's.
   * The ids arrive from a browser; a foreign one would link this invoice to —
   * and read through it — another tenant's work.
   */
  protected async unknownWorkRef(
    organizationId: string,
    items: Array<{ taskId?: string | null; reportId?: string | null }>,
  ) {
    const taskIds = [...new Set(items.map((i) => i.taskId).filter((x): x is string => !!x))];
    const reportIds = [...new Set(items.map((i) => i.reportId).filter((x): x is string => !!x))];
    const [tasks, reports] = await Promise.all([
      taskIds.length ? this.prisma.task.count({ where: { id: { in: taskIds }, organizationId } }) : 0,
      reportIds.length ? this.prisma.serviceReport.count({ where: { id: { in: reportIds }, organizationId } }) : 0,
    ]);
    return tasks === taskIds.length && reports === reportIds.length
      ? null
      : { success: false as const, message: 'A line names a job or report outside this organization', statusCode: HttpStatus.BAD_REQUEST };
  }

  protected async unknownWorker(organizationId: string, items: Array<{ workerId: string | null }>) {
    const ids = [...new Set(items.map((i) => i.workerId).filter((x): x is string => !!x))];
    if (ids.length === 0) return null;
    const found = await this.prisma.user.count({ where: { id: { in: ids }, organizationId } });
    return found === ids.length
      ? null
      : { success: false as const, message: 'A day line names somebody outside this organization', statusCode: HttpStatus.BAD_REQUEST };
  }

  /**
   * `{prefix}-{year}-{0001}` — one series per company prefix per year (shared nextInvoiceNumber).
   * Read-then-write: callers retry on P2002, which @@unique([organizationId, invoiceNumber]) raises.
   */
  protected async generateInvoiceNumber(organizationId: string, entityPrefix: string | null): Promise<string> {
    const year = new Date().getFullYear();
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { organizationId, invoiceNumber: { startsWith: invoiceNumberPrefix(entityPrefix, year) } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    return nextInvoiceNumber(entityPrefix, year, lastInvoice?.invoiceNumber ?? null);
  }

  /**
   * The company that issues an invoice: the one chosen (must be this organization's and on) →
   * the workspace's → its client's → the main one. A chosen id that is not usable is REFUSED,
   * never silently replaced — the biller picked a name to go on the paper.
   */
  protected async issuingEntity(
    organizationId: string,
    chosen: string | null | undefined,
    workspace: string | null,
    customerId: string | null,
  ) {
    const refused = await this.entities.assertUsable(organizationId, chosen);
    if (refused) return { error: refused };
    const client = customerId
      ? (await this.prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { legalEntityId: true } }))?.legalEntityId ?? null
      : null;
    const entity = await this.entities.resolveIssuer(organizationId, { invoice: chosen ?? null, workspace, client });
    if (!entity) return { error: { success: false as const, statusCode: HttpStatus.BAD_REQUEST, code: 'COMPANY_MISSING', message: 'No company is set up to issue invoices.' } };
    return { entity };
  }

  /** The issuer as the invoice shows it: the frozen copy once issued, the live company for a draft. */
  protected async issuerFor(invoice: {
    organizationId: string;
    legalEntityId: string | null;
    issuer: unknown;
    currency: string;
    status?: string;
  }): Promise<IssuerSnapshot | null> {
    if (invoice.issuer && typeof invoice.issuer === 'object') return invoice.issuer as IssuerSnapshot;
    const id = invoice.legalEntityId ?? (await this.entities.ensureMain(invoice.organizationId));
    const entity = await this.entities.entityWithBank(invoice.organizationId, id);
    return entity ? this.entities.snapshotOf(entity, invoice.currency) : null;
  }
}
