/**
 * Money on the web — a thin layer over the shared cents formatter
 * (`formatMoney(cents, currency, locale)` in `@hbcfield/shared`), which owns the
 * Intl logic: `narrowSymbol` ("$", not "US$"), a cached formatter per
 * locale+currency, and never throwing on a bad currency code from real data.
 *
 * ⚠️ ONE UNIT. The shared formatter takes integer CENTS. A caller holding cents
 * (`*Cents` fields: rates, statements) calls `formatMoney` directly; a caller
 * holding an AMOUNT (invoice totals and lines arrive as 12.5) calls
 * `formatAmount`, which converts once. There is deliberately no web function
 * named formatMoney that takes an amount — that name meant amounts here and
 * cents on the phone, and a value carried between them read 100× wrong.
 *
 * ⚠️ THE LOCALE IS PINNED (`MONEY_LOCALE`), not taken from the browser or the
 * UI language. An invoice is a record: the same document must not read
 * "€1,234.56" on one machine and "1.234,56 €" on another, and the list of
 * invoices must not disagree with the invoice it links to. The CURRENCY still
 * comes from the record's own field — it is the grouping and decimal marks that
 * are fixed. (The client's PDF is written in the CLIENT's language and passes
 * that language's pinned locale — still one answer per document, never one per
 * machine.)
 */
import { formatMoney, toCents } from "@hbcfield/shared/client"

export { formatMoney, toCents, fromCents, currencySymbol } from "@hbcfield/shared/client"

/** The pinned locale money is written in on screens that show records (invoices, rates, statements). */
export const MONEY_LOCALE = "en-IE"

/** An AMOUNT (12.5, not cents) as money — pinned locale unless a document names its reader's. */
export function formatAmount(amount: number | null | undefined, currency?: string | null, locale: string = MONEY_LOCALE): string {
  return formatMoney(toCents(amount), currency, locale)
}
