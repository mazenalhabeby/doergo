/**
 * An amount of money, as this product writes it.
 *
 * ⚠️ `US$1,234.50` IS WHAT SIX COPIES OF THIS PRODUCED. Every one of them
 * passed `en-IE`, and an Irish locale disambiguates the dollar — so an invoice
 * in USD read "US$" where the person raising it expected "$". `narrowSymbol`
 * asks for the symbol a reader in that currency's own country would use.
 *
 * ⚠️ Which makes AUD and USD both "$", and that is the right trade here: every
 * surface that shows an amount also states the currency CODE beside it (the
 * client's copy has a Currency row; the list has a column), and a reader who
 * needs to tell A$ from $ has it. A reader who does not needs a dollar sign.
 *
 * ⚠️ THE LOCALE IS PINNED, not taken from the browser or the UI language. An
 * invoice is a record: the same document must not read "€1,234.56" on one
 * machine and "1.234,56 €" on another, and the list of invoices must not
 * disagree with the invoice it links to. The CURRENCY still comes from the
 * invoice's own field — it is the grouping and decimal marks that are fixed.
 * (The client's PDF is written in the CLIENT's language and passes that
 * language's pinned locale to `formatMoneyIn` — still one answer per document,
 * never one per machine.)
 *
 * ⚠️ And it must never throw. A bad or empty currency code arrives from real
 * data; `Intl` raises a RangeError on one, and a screen about money is the
 * worst place to trade a wrong symbol for a blank page.
 */

const LOCALE = "en-IE"

export function formatMoney(amount: number, currency?: string | null): string {
  return formatMoneyIn(amount, currency, LOCALE)
}

/** The same rules, in a named Intl locale — for a document written in its reader's language. */
export function formatMoneyIn(amount: number, currency: string | null | undefined, locale: string): string {
  const code = (currency || "EUR").toUpperCase()
  const value = Number.isFinite(amount) ? amount : 0

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).format(value)
  } catch {
    /* `narrowSymbol` is ES2020; fall back to the wide symbol rather than to a
       bare number, which loses the currency entirely. */
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value)
    } catch {
      // An unknown code — say the number and the code, and stay on the screen.
      return `${value.toFixed(2)} ${code}`
    }
  }
}
