import {
  DEFAULT_LOCALE,
  normalizeLocale,
  issuerAddressLines,
  toISODateString,
  type IssuerSnapshot,
  type SupportedLocale
} from "@hbcfield/shared/client"
import { formatAmount } from "./money"
import {
  type InvoiceDocumentLabels,
  documentLocaleOf,
  formatDocumentMoney,
  formatDocumentDate,
  fillLabel,
} from "./invoice-document-labels"
export {
  type InvoiceDocumentLabels,
  documentLocaleOf,
  formatDocumentMoney,
  formatDocumentDate,
  fillLabel,
  pdfLocaleFor,
  pdfText,
  invoiceDayInstant,
  invoiceDayKey,
  formatDocumentQuantity,
  documentUpper,
  documentIssuer,
} from "./invoice-document-labels"

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
    taxId: "Tax ID", register: "Register no.", payTo: "Bank details", holder: "Account holder", account: "Account", routing: "Routing",
    stamp: { draft: "Draft", canceled: "Canceled", settled: "Settled" },
    units: { hoursTag: "HOURS", daysTag: "DAYS", h: "h", days: "days", day: "day", perHour: "/ h", perDay: "/ day" },
  },
  de: {
    invoice: "Rechnung",
      invoiceNumber: "Rechnungsnr.",
      issueDate: "Rechnungsdatum",
      dueDate: "Fälligkeitsdatum",
      onReceipt: "Sofort fällig",
    billTo: "Rechnung an", servicePeriod: "Leistungszeitraum", periodFrom: "Ab {{date}}", periodTo: "Bis {{date}}",
    description: "Beschreibung", qty: "Menge", unitPrice: "Einzelpreis", amount: "Betrag",
    subtotal: "Zwischensumme", discount: "Rabatt", vat: "USt.", total: "Gesamt", notes: "Anmerkungen",
    termsDue: "Bitte begleichen Sie {{total}} bis zum {{date}}.", termsOnReceipt: "Bitte begleichen Sie {{total}} sofort nach Erhalt.",
    page: "Seite {{page}} von {{pages}}", vatId: "USt-IdNr.", company: "Unternehmen",
    taxId: "Steuernummer", register: "Firmenbuch", payTo: "Bankverbindung", holder: "Kontoinhaber", account: "Konto", routing: "Routing",
    stamp: { draft: "Entwurf", canceled: "Storniert", settled: "Beglichen" },
    units: { hoursTag: "STUNDEN", daysTag: "TAGE", h: "h", days: "Tage", day: "Tag", perHour: "/ Std.", perDay: "/ Tag" },
  },
  es: {
    invoice: "Factura",
      invoiceNumber: "N.º de factura",
      issueDate: "Fecha de emisión",
      dueDate: "Fecha de vencimiento",
      onReceipt: "Al recibir",
    billTo: "Facturar a", servicePeriod: "Periodo de servicio", periodFrom: "Desde {{date}}", periodTo: "Hasta {{date}}",
    description: "Descripción", qty: "Cant.", unitPrice: "Precio unitario", amount: "Importe",
    subtotal: "Subtotal", discount: "Descuento", vat: "IVA", total: "Total", notes: "Notas",
    termsDue: "Le rogamos abone {{total}} antes del {{date}}.", termsOnReceipt: "Le rogamos abone {{total}} a la recepción.",
    page: "Página {{page}} de {{pages}}", vatId: "NIF-IVA", company: "Empresa",
    taxId: "Número fiscal", register: "Registro", payTo: "Datos bancarios", holder: "Titular", account: "Cuenta", routing: "Routing (ABA)",
    stamp: { draft: "Borrador", canceled: "Anulada", settled: "Liquidada" },
    units: { hoursTag: "HORAS", daysTag: "DÍAS", h: "h", days: "días", day: "día", perHour: "/ h", perDay: "/ día" },
  },
  fr: {
    invoice: "Facture", invoiceNumber: "Facture n°", issueDate: "Date d'émission", dueDate: "Date d'échéance", onReceipt: "À réception",
    billTo: "Facturé à", servicePeriod: "Période de prestation", periodFrom: "À partir du {{date}}", periodTo: "Jusqu'au {{date}}",
    description: "Description", qty: "Qté", unitPrice: "Prix unitaire", amount: "Montant",
    subtotal: "Sous-total", discount: "Remise", vat: "TVA", total: "Total", notes: "Remarques",
    termsDue: "Merci de régler {{total}} avant le {{date}}.", termsOnReceipt: "Merci de régler {{total}} à réception.",
    page: "Page {{page}} sur {{pages}}", vatId: "N° TVA", company: "Entreprise",
    taxId: "N° fiscal",
      register: "Registre",
      payTo: "Coordonnées bancaires",
      holder: "Titulaire",
      account: "Compte",
      routing: "Routing (ABA)",
    stamp: { draft: "Brouillon", canceled: "Annulée", settled: "Réglée" },
    units: { hoursTag: "HEURES", daysTag: "JOURS", h: "h", days: "jours", day: "jour", perHour: "/ h", perDay: "/ jour" },
  },
  it: {
    invoice: "Fattura",
      invoiceNumber: "Fattura n.",
      issueDate: "Data di emissione",
      dueDate: "Data di scadenza",
      onReceipt: "Al ricevimento",
    billTo: "Fatturato a", servicePeriod: "Periodo di servizio", periodFrom: "Dal {{date}}", periodTo: "Fino al {{date}}",
    description: "Descrizione", qty: "Qtà", unitPrice: "Prezzo unitario", amount: "Importo",
    subtotal: "Subtotale", discount: "Sconto", vat: "IVA", total: "Totale", notes: "Note",
    termsDue: "La preghiamo di saldare {{total}} entro il {{date}}.", termsOnReceipt: "La preghiamo di saldare {{total}} al ricevimento.",
    page: "Pagina {{page}} di {{pages}}", vatId: "P. IVA", company: "Azienda",
    taxId: "Codice fiscale",
      register: "Registro imprese",
      payTo: "Coordinate bancarie",
      holder: "Intestatario",
      account: "Conto",
      routing: "Routing (ABA)",
    stamp: { draft: "Bozza", canceled: "Annullata", settled: "Saldata" },
    units: { hoursTag: "ORE", daysTag: "GIORNI", h: "h", days: "giorni", day: "giorno", perHour: "/ h", perDay: "/ giorno" },
  },
}

export function invoiceDocumentLabels(locale: unknown): InvoiceDocumentLabels {
  return INVOICE_DOCUMENT_LABELS[documentLocaleOf(locale)]
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
