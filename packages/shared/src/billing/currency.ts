/**
 * Which currency an amount is in — the organization's, a workspace's, a client's,
 * and the one an invoice was issued in.
 *
 * ⚠️ A RATE IS A NUMBER WITHOUT A UNIT. `rate_history.cents = 8500` means 85 of
 * whatever its workspace bills in; the currency is a property of the place the
 * rate belongs to, never of the rate. So a worker's OWN rates (what you pay them)
 * are in the ORGANIZATION's currency, and everything a client is charged in a
 * workspace is in THAT workspace's currency.
 *
 * ⚠️ An invoice STORES its currency and its exchange rate. Changing a setting
 * later never changes an issued document, and reports a year on still read the
 * rate of the day it was issued.
 *
 * Browser-safe: the forms offer exactly the list the server accepts.
 */

/**
 * The currencies offered. Every one of them has a daily European Central Bank
 * reference rate, so a cross-currency invoice can always fill its rate in.
 * The first group is what most customers use; the rest follow alphabetically.
 */
export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;
export const SUPPORTED_CURRENCIES = [
  ...COMMON_CURRENCIES,
  'AUD', 'BGN', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK',
  'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR',
] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** What an organization bills in until somebody says otherwise. */
export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

export const CURRENCY_INVALID_MESSAGE = 'Unsupported currency';

export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * What a write may put in a currency field.
 *
 * - `null` / "" CLEARS an optional one (a workspace or client "same as the
 *   organization") — only where `optional` is set; the organization's own
 *   currency can never be empty;
 * - a supported code in any case, with surrounding space, is stored upper-case;
 * - anything else is REFUSED, not dropped: it is chosen from a list, so an
 *   unknown value is a bug or a forged request, and saving the rest of the record
 *   while ignoring it would say "saved" about something that was not.
 */
export type CurrencyInput = { ok: true; currency: CurrencyCode | null } | { ok: false };

export function parseCurrency(value: unknown, opts: { optional?: boolean } = {}): CurrencyInput {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return opts.optional ? { ok: true, currency: null } : { ok: false };
  }
  if (typeof value !== 'string') return { ok: false };
  const v = value.trim().toUpperCase();
  return isSupportedCurrency(v) ? { ok: true, currency: v } : { ok: false };
}

/** A stored value read back: a supported code, or null for anything else. */
export function currencyOrNull(value: unknown): CurrencyCode | null {
  const p = parseCurrency(value, { optional: true });
  return p.ok ? p.currency : null;
}

export type CurrencySource = 'workspace' | 'client' | 'organization';

/**
 * The currency a new invoice starts in: the workspace's, then the client's,
 * then the organization's — the same order the rates follow.
 */
export function resolveInvoiceCurrency(input: {
  space?: { currency?: string | null } | null;
  customer?: { currency?: string | null } | null;
  organization?: { currency?: string | null } | null;
}): { currency: CurrencyCode; source: CurrencySource } {
  const space = currencyOrNull(input.space?.currency);
  if (space) return { currency: space, source: 'workspace' };
  const client = currencyOrNull(input.customer?.currency);
  if (client) return { currency: client, source: 'client' };
  return { currency: currencyOrNull(input.organization?.currency) ?? DEFAULT_CURRENCY, source: 'organization' };
}

/** The currency of a workspace's rates: its own, or the organization's. */
export function workspaceCurrency(
  space: { currency?: string | null } | null | undefined,
  organization: { currency?: string | null } | null | undefined,
): CurrencyCode {
  return currencyOrNull(space?.currency) ?? currencyOrNull(organization?.currency) ?? DEFAULT_CURRENCY;
}

/* ── Exchange rates ─────────────────────────────────────────────────────── */

/**
 * `1 {from} = rate {to}`, from the ECB's euro reference rates (`1 EUR = r[X] X`).
 * Null when either side has no rate that day — never a guess.
 */
export function crossRate(eurRates: Partial<Record<string, number>>, from: string, to: string): number | null {
  if (from === to) return 1;
  const rf = from === 'EUR' ? 1 : eurRates[from];
  const rt = to === 'EUR' ? 1 : eurRates[to];
  if (!rf || !rt || !Number.isFinite(rf) || !Number.isFinite(rt)) return null;
  return roundRate(rt / rf);
}

/** Six significant decimals is what a bank quotes; more is noise that never matches a statement. */
export function roundRate(rate: number): number {
  return Math.round(rate * 1e6) / 1e6;
}

/**
 * What an exchange rate field may hold: null to clear, else a positive finite
 * number. A zero or negative rate is refused — it would turn a margin into
 * nonsense that still looks like a number.
 */
export type ExchangeRateInput = { ok: true; rate: number | null } | { ok: false };
export function parseExchangeRate(value: unknown): ExchangeRateInput {
  if (value === null || value === undefined || value === '') return { ok: true, rate: null };
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1e7) return { ok: false };
  return { ok: true, rate: roundRate(n) };
}

export const EXCHANGE_RATE_INVALID_MESSAGE = 'Exchange rate must be a positive number';

/**
 * An amount in the invoice's currency, in the organization's — or null when the
 * two differ and no rate is known. Callers show "—", never a wrong figure.
 */
export function toOrganizationCurrency(
  amount: number,
  invoiceCurrency: string,
  organizationCurrency: string,
  rate: number | null | undefined,
): number | null {
  if (invoiceCurrency === organizationCurrency) return amount;
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
  return amount * rate;
}
