import jsPDF from "jspdf"
import type { IssuerSnapshot, SupportedLocale } from "@hbcfield/shared/client"
import { invoiceStamp } from "./invoice-status"
import { PDF_PALETTE } from "./pdf-common"
import { documentUpper, type InvoiceDocumentLabels } from "./invoice-document-locale"

export interface InvoiceBranding {
  /** Nullable like the rest: it comes straight off the organization profile. */
  name?: string | null
  logoUrl?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  vatId?: string | null
}

export interface InvoicePdfItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
  /** HEADING = a work-role heading: one cell across the table, no figures. */
  lineKind?: "HOURS" | "DAYS" | "HEADING" | null
}

export interface InvoicePdfData {
  invoiceNumber: string
  status: string
  clientName: string
  clientEmail?: string | null
  clientAddress?: string | null
  currency: string
  subtotal: number
  taxRate?: number | null
  taxAmount: number
  discount: number
  total: number
  issueDate?: string | Date | null
  dueDate?: string | Date | null
  /** The days the work was done, if the invoice covers a defined period. */
  servicePeriodFrom?: string | Date | null
  servicePeriodTo?: string | Date | null
  notes?: string | null
  items: InvoicePdfItem[]
  /** The HOURS / DAYS tag before each labour line, as on the screen. Default shown. */
  showLineTags?: boolean | null
  /**
   * The language the client's copy is written in: the invoice's
   * `documentLocale`, or the one the office picked for this download.
   * Absent reads English.
   */
  locale?: SupportedLocale | null
  /** Who it is from: the frozen issuer (issued) or the live company (draft). Wins over the branding. */
  issuer?: IssuerSnapshot | null
}

export const { INK, MUTED, ACCENT, LINE } = PDF_PALETTE

/**
 * A stamp, but only when the reader must not mistake what they are holding.
 *
 * The status used to be printed on every invoice as a small grey word beside
 * the number — so a customer received a document saying "SENT", which tells
 * them nothing they do not already know, and a draft was marked so quietly
 * that it read as part of the reference.
 *
 * Three states earn a mark and the rest earn silence:
 *
 *   DRAFT     this is not an invoice yet. Nobody should pay it, and nobody
 *             should file it. Said loudly, because a draft mistaken for an
 *             invoice is the expensive direction of that mistake.
 *   CANCELED  it was an invoice and is not owed. Same reasoning.
 *   PAID      conventional, and useful to whoever opens the file later. The
 *             stamp reads SETTLED (and its translations): the product never
 *             prints "paid".
 *
 * SENT, OVERDUE and REFUNDED are deliberately not drawn. Beyond meaning little
 * to the reader, they go STALE: a PDF is a frozen copy that outlives the state
 * it was generated in, so one stamped OVERDUE still says so a year after it was
 * settled. A status that can change must not be baked into a file.
 */
export function drawStatusStamp(
  doc: jsPDF,
  status: string,
  L: InvoiceDocumentLabels,
  locale: SupportedLocale | null,
  pageW: number,
  pageH: number,
  margin: number,
): void {
  const stamp = invoiceStamp(status)
  if (!stamp) return
  // In the reader's language: a DRAFT they cannot read is not a warning.
  const text = documentUpper(L.stamp[stamp.kind], locale)

  // Diagonal across the page, behind nothing and over everything — a watermark
  // that has to be read rather than found. On EVERY page: the second page of a
  // draft, printed on its own, must not read as an invoice either.
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.saveGraphicsState()
    // @ts-expect-error — GState is provided by jsPDF at runtime, not in its types.
    doc.setGState(new doc.GState({ opacity: 0.16 }))
    doc.setFont("helvetica", "bold")
    doc.setFontSize(74)
    doc.setTextColor(stamp.color.r, stamp.color.g, stamp.color.b)
    doc.text(text, pageW / 2, pageH / 2, { align: "center", angle: 32 })
    doc.restoreGraphicsState()
  }

  // And once more, small and solid under the invoice number on the first page,
  // so it survives being printed in greyscale or read at thumbnail size.
  doc.setPage(1)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(stamp.color.r, stamp.color.g, stamp.color.b)
  // Directly beneath the invoice number, which sits at margin + 12.
  doc.text(text, pageW - margin, margin + 17, { align: "right" })
}
