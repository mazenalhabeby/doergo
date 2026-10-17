import {
  DEFAULT_LOCALE,
  normalizeLocale,
  issuerAddressLines,
  toISODateString,
  type IssuerSnapshot,
  type SupportedLocale,
} from "@hbcfield/shared/client"
import { formatAmount } from "./money"

export interface InvoiceDocumentLabels {
  invoice: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  onReceipt: string
  billTo: string
  servicePeriod: string
  /** `{{date}}` */
  periodFrom: string
  /** `{{date}}` */
  periodTo: string
  description: string
  qty: string
  unitPrice: string
  amount: string
  subtotal: string
  discount: string
  vat: string
  total: string
  notes: string
  /** `{{total}}`, `{{date}}` */
  termsDue: string
  /** `{{total}}` */
  termsOnReceipt: string
  /** `{{page}}`, `{{pages}}` */
  page: string
  vatId: string
  /** The issuing company's other identifiers and how to pay it (Settings › Companies). */
  taxId: string
  register: string
  payTo: string
  holder: string
  account: string
  routing: string
  /** Letterhead fallback when the organization has no name on file. */
  company: string
  stamp: { draft: string; canceled: string; settled: string }
  /** Labour lines say what they count: tags, units, per hour / per day. */
  units: { hoursTag: string; daysTag: string; h: string; days: string; day: string; perHour: string; perDay: string }
}

/** Any spelling of a language → one we write an invoice in; unknown reads English. */
export function documentLocaleOf(value: unknown): SupportedLocale {
  return normalizeLocale(value) ?? DEFAULT_LOCALE
}

/**
 * The PDF's language for one download.
 *
 * `null` means the CLIENT's — the invoice's `documentLocale`, decided on the
 * server. A language picked from the menu wins for as long as the page is open:
 * it answers "this one, this time", and is never written back to the client
 * record, which has its own field for that.
 */
export function pdfLocaleFor(inv: { documentLocale?: string | null }, override: SupportedLocale | null): SupportedLocale {
  return override ?? documentLocaleOf(inv.documentLocale)
}

/*
  The Intl locale each language formats with — PINNED, never the browser's.

  An invoice is a record: the same document must read the same on every machine
  that prints it. English keeps what the client's copy always used (en-IE money,
  en-GB dates: "05 Sep 2026", "€1,234.50"); the others take their home country's
  conventions, which is what a reader of that language expects on an invoice.
*/
export const INTL_LOCALE: Record<SupportedLocale, { money: string; date: string }> = {
  en: { money: "en-IE", date: "en-GB" },
  de: { money: "de-DE", date: "de-DE" },
  es: { money: "es-ES", date: "es-ES" },
  fr: { money: "fr-FR", date: "fr-FR" },
  it: { money: "it-IT", date: "it-IT" },
}

/**
 * Text the PDF font can draw.
 *
 * ⚠️ French groups thousands with a NARROW no-break space (U+202F) and several
 * locales put a no-break space before "€". Helvetica in jsPDF is Latin-1 — it
 * has no U+202F, and draws it as garbage between the digits of the one number
 * the client reads first. Every space-like character becomes a plain space.
 */
export function pdfText(s: string): string {
  return s.replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, " ")
}

export function formatDocumentMoney(amount: number, currency: string | null | undefined, locale: unknown): string {
  return pdfText(formatAmount(amount, currency, INTL_LOCALE[documentLocaleOf(locale)].money))
}

/**
 * An invoice's issue / due / service-period day as an instant to format IN UTC.
 *
 * ⚠️ These are calendar DATES, not moments. The server stores a day as the
 * start of it in UTC (the period END at 23:59:59.999Z), and a `YYYY-MM-DD`
 * from a form parses as UTC midnight. Formatting either in the reader's own
 * zone moved the day: "30 Sept" read "01 Oct" in Vienna, "01 Sept" read
 * "31 Aug" in Chicago. Every invoice date is formatted with `timeZone: "UTC"`,
 * which reads its stored UTC date part — right for old rows and new alike.
 */
export function invoiceDayInstant(d: string | Date | null | undefined): Date | null {
  if (!d) return null
  const dt = typeof d === "string" ? new Date(d) : d
  return isNaN(dt.getTime()) ? null : dt
}

/** The calendar day an invoice date stands for, `YYYY-MM-DD`. */
export function invoiceDayKey(d: string | Date | null | undefined): string | null {
  const dt = invoiceDayInstant(d)
  return dt ? toISODateString(dt) : null
}

export function formatDocumentDate(d: string | Date | null | undefined, locale: unknown): string {
  const dt = invoiceDayInstant(d)
  if (!dt) return "—"
  return pdfText(
    dt.toLocaleDateString(INTL_LOCALE[documentLocaleOf(locale)].date, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }))
}

/** A line's quantity: "1.5" in English, "1,5" in German — at most two decimals. */
export function formatDocumentQuantity(quantity: number, locale: unknown): string {
  const value = Number.isFinite(quantity) ? quantity : 0
  return pdfText(value.toLocaleString(INTL_LOCALE[documentLocaleOf(locale)].date, { maximumFractionDigits: 2 }))
}

/** Upper case the way the language does it ("Facturé à" → "FACTURÉ À"). */
export function documentUpper(s: string, locale: unknown): string {
  return s.toLocaleUpperCase(INTL_LOCALE[documentLocaleOf(locale)].date)
}

/** `{{name}}` → value. Values are data (a date, an amount) and go in as they are. */
export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}

/** The org-profile shape the letterhead fell back to before companies existed. */
export interface LetterheadFallback {
  name?: string | null
  logoUrl?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  vatId?: string | null
}

export interface DocumentIssuer {
  name: string | null
  logoUrl: string | null
  addressLines: string[]
  /** "VAT / UID: ATU…", "Tax ID: 12-…", "Register no.: FN …" */
  idLines: string[]
  /** How to pay: holder, bank, IBAN/BIC or account/routing. Empty = no bank details on file. */
  paymentLines: string[]
}

/**
 * Who the invoice is FROM, and where to pay — one builder for the screen and the PDF.
 *
 * The invoice's `issuer` (frozen when issued, the live company for a draft) wins; the
 * organization profile is only the fallback for a screen that has no invoice yet.
 */
export function documentIssuer(
  issuer: IssuerSnapshot | null | undefined,
  fallback: LetterheadFallback | null | undefined,
  L: InvoiceDocumentLabels): DocumentIssuer {
  if (issuer) {
    const ids = [
      issuer.vatId && `${L.vatId}: ${issuer.vatId}`,
      issuer.taxId && `${L.taxId}: ${issuer.taxId}`,
      issuer.registerNumber && `${L.register}: ${issuer.registerNumber}`,
    ].filter((x): x is string => !!x)
    const b = issuer.bank
    const pay = b
      ? [
          b.holder && `${L.holder}: ${b.holder}`,
          b.bankName,
          b.iban && `IBAN ${b.iban.replace(/(.{4})/g, "$1 ").trim()}`,
          b.bic && `BIC ${b.bic}`,
          b.accountNumber && `${L.account} ${b.accountNumber}`,
          b.routingNumber && `${L.routing} ${b.routingNumber}`,
        ].filter((x): x is string => !!x)
      : []
    return { name: issuer.legalName, logoUrl: issuer.logoUrl, addressLines: issuerAddressLines(issuer), idLines: ids, paymentLines: pay }
  }
  const f = fallback ?? {}
  const cityLine = [f.postalCode, f.city].filter(Boolean).join(" ")
  return {
    name: f.name ?? null,
    logoUrl: f.logoUrl ?? null,
    addressLines: [f.addressLine1 || f.address, f.addressLine2, [cityLine, f.state].filter(Boolean).join(", "), f.country]
      .filter((x): x is string => !!x && x.trim().length > 0),
    idLines: f.vatId ? [`${L.vatId}: ${f.vatId}`] : [],
    paymentLines: [],
  }
}
