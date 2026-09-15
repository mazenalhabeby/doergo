import { DEFAULT_LOCALE, normalizeLocale, SUPPORTED_LOCALES, type SupportedLocale } from "@hbcfield/shared/client"
import { formatMoneyIn } from "./money"

/**
 * The client's copy of an invoice, in the CLIENT's language.
 *
 * The office reads the product in its own language; the invoice is read by the
 * client's accounts department. Which language that is comes from the server
 * (`documentLocale` on the invoice — the same rule every client email follows:
 * their account, the client record, the organization's country, English), and
 * the office may pick another for one download.
 *
 * ⚠️ ONLY THE DOCUMENT'S OWN WORDS. "Invoice", "Due date", "Qty", the terms
 * sentence and the watermark are ours and are translated here. A line's
 * description, the notes, the client's name and address, the organization's
 * name — those were written by somebody and go as written.
 *
 * ⚠️ NOT the web catalogue (`i18n/locales/*.json`). The PDF's language is not
 * the screen's, and only English is bundled on the web — asking i18next for the
 * German words while the office works in English would mean fetching the whole
 * German catalogue for a dozen labels, or silently printing English.
 *
 * Product rules the spec holds: all five languages carry every label, German is
 * formal ("Sie"), and nothing says "paid" in any language — a settled invoice's
 * stamp says SETTLED.
 */

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
  /** Letterhead fallback when the organization has no name on file. */
  company: string
  stamp: { draft: string; canceled: string; settled: string }
}

/*
  ⚠️ Plain apostrophes, not typographic ones. The PDF is drawn with jsPDF's
  built-in Helvetica, which covers Latin-1 — every accent these languages use —
  but a curly quote is a character the font may not hold.
*/
export const INVOICE_DOCUMENT_LABELS: Record<SupportedLocale, InvoiceDocumentLabels> = {
  en: {
    invoice: "Invoice", invoiceNumber: "Invoice no.", issueDate: "Issue date", dueDate: "Due date", onReceipt: "On receipt",
    billTo: "Bill to", servicePeriod: "Service period", periodFrom: "From {{date}}", periodTo: "Up to {{date}}",
    description: "Description", qty: "Qty", unitPrice: "Unit price", amount: "Amount",
    subtotal: "Subtotal", discount: "Discount", vat: "VAT", total: "Total", notes: "Notes",
    termsDue: "Please settle {{total}} by {{date}}.", termsOnReceipt: "Please settle {{total}} on receipt.",
    page: "Page {{page}} of {{pages}}", vatId: "VAT / UID", company: "Company",
    stamp: { draft: "Draft", canceled: "Canceled", settled: "Settled" },
  },
  de: {
    invoice: "Rechnung", invoiceNumber: "Rechnungsnr.", issueDate: "Rechnungsdatum", dueDate: "Fälligkeitsdatum", onReceipt: "Sofort fällig",
    billTo: "Rechnung an", servicePeriod: "Leistungszeitraum", periodFrom: "Ab {{date}}", periodTo: "Bis {{date}}",
    description: "Beschreibung", qty: "Menge", unitPrice: "Einzelpreis", amount: "Betrag",
    subtotal: "Zwischensumme", discount: "Rabatt", vat: "USt.", total: "Gesamt", notes: "Anmerkungen",
    termsDue: "Bitte begleichen Sie {{total}} bis zum {{date}}.", termsOnReceipt: "Bitte begleichen Sie {{total}} sofort nach Erhalt.",
    page: "Seite {{page}} von {{pages}}", vatId: "USt-IdNr.", company: "Unternehmen",
    stamp: { draft: "Entwurf", canceled: "Storniert", settled: "Beglichen" },
  },
  es: {
    invoice: "Factura", invoiceNumber: "N.º de factura", issueDate: "Fecha de emisión", dueDate: "Fecha de vencimiento", onReceipt: "Al recibir",
    billTo: "Facturar a", servicePeriod: "Periodo de servicio", periodFrom: "Desde {{date}}", periodTo: "Hasta {{date}}",
    description: "Descripción", qty: "Cant.", unitPrice: "Precio unitario", amount: "Importe",
    subtotal: "Subtotal", discount: "Descuento", vat: "IVA", total: "Total", notes: "Notas",
    termsDue: "Le rogamos abone {{total}} antes del {{date}}.", termsOnReceipt: "Le rogamos abone {{total}} a la recepción.",
    page: "Página {{page}} de {{pages}}", vatId: "NIF-IVA", company: "Empresa",
    stamp: { draft: "Borrador", canceled: "Anulada", settled: "Liquidada" },
  },
  fr: {
    invoice: "Facture", invoiceNumber: "Facture n°", issueDate: "Date d'émission", dueDate: "Date d'échéance", onReceipt: "À réception",
    billTo: "Facturé à", servicePeriod: "Période de prestation", periodFrom: "À partir du {{date}}", periodTo: "Jusqu'au {{date}}",
    description: "Description", qty: "Qté", unitPrice: "Prix unitaire", amount: "Montant",
    subtotal: "Sous-total", discount: "Remise", vat: "TVA", total: "Total", notes: "Remarques",
    termsDue: "Merci de régler {{total}} avant le {{date}}.", termsOnReceipt: "Merci de régler {{total}} à réception.",
    page: "Page {{page}} sur {{pages}}", vatId: "N° TVA", company: "Entreprise",
    stamp: { draft: "Brouillon", canceled: "Annulée", settled: "Réglée" },
  },
  it: {
    invoice: "Fattura", invoiceNumber: "Fattura n.", issueDate: "Data di emissione", dueDate: "Data di scadenza", onReceipt: "Al ricevimento",
    billTo: "Fatturato a", servicePeriod: "Periodo di servizio", periodFrom: "Dal {{date}}", periodTo: "Fino al {{date}}",
    description: "Descrizione", qty: "Qtà", unitPrice: "Prezzo unitario", amount: "Importo",
    subtotal: "Subtotale", discount: "Sconto", vat: "IVA", total: "Totale", notes: "Note",
    termsDue: "La preghiamo di saldare {{total}} entro il {{date}}.", termsOnReceipt: "La preghiamo di saldare {{total}} al ricevimento.",
    page: "Pagina {{page}} di {{pages}}", vatId: "P. IVA", company: "Azienda",
    stamp: { draft: "Bozza", canceled: "Annullata", settled: "Saldata" },
  },
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

export function invoiceDocumentLabels(locale: unknown): InvoiceDocumentLabels {
  return INVOICE_DOCUMENT_LABELS[documentLocaleOf(locale)]
}

/*
  The Intl locale each language formats with — PINNED, never the browser's.

  An invoice is a record: the same document must read the same on every machine
  that prints it. English keeps what the client's copy always used (en-IE money,
  en-GB dates: "05 Sep 2026", "€1,234.50"); the others take their home country's
  conventions, which is what a reader of that language expects on an invoice.
*/
const INTL_LOCALE: Record<SupportedLocale, { money: string; date: string }> = {
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
  return pdfText(formatMoneyIn(amount, currency, INTL_LOCALE[documentLocaleOf(locale)].money))
}

export function formatDocumentDate(d: string | Date | null | undefined, locale: unknown): string {
  if (!d) return "—"
  const dt = typeof d === "string" ? new Date(d) : d
  if (isNaN(dt.getTime())) return "—"
  return pdfText(dt.toLocaleDateString(INTL_LOCALE[documentLocaleOf(locale)].date, { day: "2-digit", month: "short", year: "numeric" }))
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

/**
 * The payment-terms sentence under the totals, or null where there is nothing
 * left to ask for — a settled or cancelled invoice asking the client to settle
 * it is the one sentence that would make them ring the office.
 */
export function termsSentence(
  locale: unknown,
  inv: { status: string; total: number; currency: string; dueDate?: string | Date | null },
): string | null {
  const status = (inv.status || "").trim().toUpperCase()
  if (status === "PAID" || status === "CANCELED" || status === "CANCELLED" || status === "REFUNDED") return null
  const l = invoiceDocumentLabels(locale)
  const total = formatDocumentMoney(inv.total, inv.currency, locale)
  return inv.dueDate
    ? fillLabel(l.termsDue, { total, date: formatDocumentDate(inv.dueDate, locale) })
    : fillLabel(l.termsOnReceipt, { total })
}

/** The five choices for "Language" on a download, each named in itself. */
export const DOCUMENT_LOCALES: readonly SupportedLocale[] = SUPPORTED_LOCALES
