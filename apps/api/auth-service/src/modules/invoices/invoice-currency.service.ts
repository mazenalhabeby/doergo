import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  parseCurrency,
  currencyOrNull,
  parseExchangeRate,
  DEFAULT_CURRENCY,
  CURRENCY_INVALID_MESSAGE,
  EXCHANGE_RATE_INVALID_MESSAGE,
  toISODateString,
  todayKey,
  workspaceZone,
} from '@hbcfield/shared';
import { ExchangeRateService } from './exchange-rate.service';

/**
 * An invoice's money and date: the organization's currency, "today" in the
 * workspace's zone, and the currency + exchange rate an invoice is saved with.
 */
@Injectable()
export class InvoiceCurrencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: ExchangeRateService,
  ) {}

  /** The organization's currency — what costs, statements and margins are in. */
  async organizationCurrency(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { currency: true },
    });
    return currencyOrNull(org?.currency) ?? DEFAULT_CURRENCY;
  }

  /**
   * "Today" for an invoice that names no date — the workspace's day, else the
   * organization's. The UTC day dated an invoice issued at 00:30 in Vienna the
   * day before.
   */
  async todayFor(organizationId: string, spaceId?: string | null): Promise<string> {
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
  async currencyFields(
    organizationId: string,
    input: {
      currency?: string;
      exchangeRate?: unknown;
      exchangeRateSource?: string | null;
      exchangeRateDate?: string | null;
      issueDate?: string | Date | null;
    },
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
    const issueDay =
      issued && !Number.isNaN(issued.getTime()) ? toISODateString(issued) : await this.todayFor(organizationId);
    if (typed.rate != null) {
      const source = input.exchangeRateSource === 'ECB' ? 'ECB' : 'MANUAL';
      const day =
        input.exchangeRateDate && /^\d{4}-\d{2}-\d{2}$/.test(input.exchangeRateDate)
          ? input.exchangeRateDate
          : issueDay;
      return {
        currency,
        baseCurrency,
        exchangeRate: typed.rate,
        exchangeRateSource: source,
        exchangeRateDate: new Date(`${day}T00:00:00Z`),
      };
    }
    if (input.exchangeRate === null) {
      // Cleared on purpose: no margin for this invoice.
      return { currency, baseCurrency, exchangeRate: null, exchangeRateSource: null, exchangeRateDate: null };
    }
    const ecb = await this.rates.rate(currency, baseCurrency, issueDay);
    return {
      currency,
      baseCurrency,
      exchangeRate: ecb?.rate ?? null,
      exchangeRateSource: ecb ? 'ECB' : null,
      exchangeRateDate: ecb ? new Date(`${ecb.date}T00:00:00Z`) : null,
    };
  }
}
