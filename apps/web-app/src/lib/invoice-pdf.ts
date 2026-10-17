import { formatHoursMinutes } from "@hbcfield/shared/client"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { IssuerSnapshot, SupportedLocale } from "@hbcfield/shared/client"
import { invoiceStamp } from "./invoice-status"
import { PDF_PALETTE, PDF_TABLE_THEME, loadLogo } from "./pdf-common"
import { dayKeyOf, fileNamePart, pdfFileName, periodPart } from "./pdf-filename"
import {
  documentUpper, fillLabel, formatDocumentDate, formatDocumentMoney, formatDocumentQuantity,
  invoiceDocumentLabels, termsSentence, documentIssuer, type InvoiceDocumentLabels,
} from "./invoice-document-locale"
import {
  type InvoiceBranding,
  type InvoicePdfData,
  INK,
  MUTED,
  ACCENT,
  LINE,
  drawStatusStamp,
} from "./invoice-branding"
export { type InvoiceBranding, type InvoicePdfData } from "./invoice-branding"

/**
 * Client-side invoice PDF, mirroring the "PDF studio" approach in report-pdf.ts
 * (jsPDF + jspdf-autotable, org letterhead with logo/address, graceful fallback
 * to name-only if the logo is CORS-blocked). Kept self-contained so it does not
 * depend on api.ts types (which change independently).
 *
 * Written in the CLIENT's language (`locale`) — every label, date and amount;
 * see `invoice-document-locale.ts`. Descriptions, notes and names go as written.
 */

/** The document palette — lives in pdf-common.ts; re-exported for callers that import it from here. */
export { PDF_PALETTE }

/** The document itself — exported so a test can read what a client receives. */
export async function buildDoc(inv: InvoicePdfData, branding: InvoiceBranding): Promise<jsPDF> {
  const locale = inv.locale ?? null
  const L: InvoiceDocumentLabels = invoiceDocumentLabels(locale)
  const fmtMoney = (n: number, currency: string) => formatDocumentMoney(n, currency, locale)
  const fmtDate = (d?: string | Date | null) => formatDocumentDate(d, locale)
  const upper = (text: string) => documentUpper(text, locale)
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 16
  // From whom — the invoice's company when it has one, the organization profile otherwise.
  const from = documentIssuer(inv.issuer, branding, L)
  const logo = await loadLogo(from.logoUrl ?? branding.logoUrl)

  // ── Letterhead ─────────────────────────────────────────────────────────────
  let logoW = 0
  if (logo) {
    const maxH = 16, maxW = 40, ratio = logo.w / logo.h
    let h = maxH, w = h * ratio
    if (w > maxW) { w = maxW; h = w / ratio }
    doc.addImage(logo.dataUrl, "PNG", margin, margin, w, h)
    logoW = w + 4
  }
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text(from.name || L.company, margin + logoW, margin + 5)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  let ly = margin + 10
  const contact = inv.issuer
    ? [inv.issuer.phone, inv.issuer.email, inv.issuer.website].filter(Boolean).join("  •  ")
    : [branding.phone, branding.email, branding.website].filter(Boolean).join("  •  ")
  for (const line of [...from.addressLines, contact, ...from.idLines].filter(Boolean)) { doc.text(line, margin + logoW, ly); ly += 4 }

  // ── "INVOICE" heading block (right-aligned) ─────────────────────────────────
  doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.text(upper(L.invoice), pageW - margin, margin + 6, { align: "right" })
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`${L.invoiceNumber} ${inv.invoiceNumber}`, pageW - margin, margin + 12, { align: "right" })

  let y = Math.max(ly, margin + 22) + 6
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // ── Bill-to + meta (two columns) ────────────────────────────────────────────
  const colR = pageW / 2 + 8
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.text(upper(L.billTo), margin, y, { charSpace: 0.4 })
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  let by = y + 5
  doc.text(inv.clientName || "—", margin, by); by += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  if (inv.clientAddress) {
    for (const l of inv.clientAddress.split("\n")) { doc.text(l, margin, by); by += 4 }
  }
  if (inv.clientEmail) { doc.text(inv.clientEmail, margin, by); by += 4 }

  /*
    Meta rows on the right.

    A missing due date printed as an em-dash, so the invoice read "Due date —"
    and looked broken. It is not broken: an invoice with no term is payable on
    receipt, which is a real and common arrangement — it just has to be SAID.
    A customer cannot act on a dash, and an unanswered "when" is the line an
    unpaid invoice is argued over.
  */
  const metaRows: [string, string][] = [
    [L.issueDate, fmtDate(inv.issueDate)],
    [L.dueDate, inv.dueDate ? fmtDate(inv.dueDate) : L.onReceipt],
  ]

  /*
    The days billed, where the invoice covers a defined period.

    ⚠️ Only when there is one. An invoice for a single job covers no period, and
    a row reading "Service period —" invites the question it was added to
    answer. Where hours ARE being charged, though, the client has no way to
    check "37.5h" against their own records without knowing which days it is.
  */
  if (inv.servicePeriodFrom || inv.servicePeriodTo) {
    metaRows.push([
      L.servicePeriod,
      inv.servicePeriodFrom && inv.servicePeriodTo
        ? `${fmtDate(inv.servicePeriodFrom)} - ${fmtDate(inv.servicePeriodTo)}`
        : inv.servicePeriodFrom
          ? fillLabel(L.periodFrom, { date: fmtDate(inv.servicePeriodFrom) })
          : fillLabel(L.periodTo, { date: fmtDate(inv.servicePeriodTo) }),
    ])
  }
  let my = y
  for (const [k, v] of metaRows) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    doc.text(k, colR, my)
    doc.setFont("helvetica", "bold"); doc.setTextColor(INK.r, INK.g, INK.b)
    doc.text(v, pageW - margin, my, { align: "right" })
    my += 5.5
  }

  y = Math.max(by, my) + 6

  // ── Line items table ────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [[L.description, L.qty, L.unitPrice, L.amount]],
    body: inv.items.map((it) =>
      it.lineKind === "HEADING"
        ? [{
            content: it.description.toUpperCase(),
            colSpan: 4,
            styles: { fontStyle: "bold" as const, fontSize: 7.5, textColor: [MUTED.r, MUTED.g, MUTED.b] as [number, number, number], fillColor: [248, 250, 252] as [number, number, number], cellPadding: { top: 3.5, bottom: 1.5, left: 2.5, right: 2.5 } },
          }]
        : [
            // Hours and days said out loud: a tag, a unit on the quantity, per hour / per day on the price.
            inv.showLineTags === false ? it.description
              : it.lineKind === "HOURS" ? `${L.units.hoursTag} · ${it.description}`
              : it.lineKind === "DAYS" ? `${L.units.daysTag} · ${it.description}` : it.description,
            it.lineKind === "HOURS" ? formatHoursMinutes(it.quantity)
              : it.lineKind === "DAYS" ? `${formatDocumentQuantity(it.quantity, locale)} ${it.quantity === 1 ? L.units.day : L.units.days}`
                : formatDocumentQuantity(it.quantity, locale),
            fmtMoney(it.unitPrice, inv.currency) + (it.lineKind === "HOURS" ? ` ${L.units.perHour}` : it.lineKind === "DAYS" ? ` ${L.units.perDay}` : ""),
            fmtMoney(it.amount, inv.currency),
          ],
    ),
    ...PDF_TABLE_THEME,
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 22 },
      2: { halign: "right", cellWidth: 36 },
      3: { halign: "right", cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  })

  // ── Totals ──────────────────────────────────────────────────────────────────
  // @ts-expect-error lastAutoTable is added by the autotable plugin at runtime
  let ty = (doc.lastAutoTable?.finalY ?? y) + 8
  const totalsX = pageW - margin - 70
  const totalLine = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(bold ? 11 : 9)
    doc.setTextColor(bold ? INK.r : MUTED.r, bold ? INK.g : MUTED.g, bold ? INK.b : MUTED.b)
    doc.text(label, totalsX, ty)
    doc.setTextColor(INK.r, INK.g, INK.b)
    doc.text(value, pageW - margin, ty, { align: "right" })
    ty += bold ? 7 : 5.5
  }
  totalLine(L.subtotal, fmtMoney(inv.subtotal, inv.currency))
  if (inv.discount) totalLine(L.discount, `- ${fmtMoney(inv.discount, inv.currency)}`)
  if (inv.taxRate) totalLine(`${L.vat} (${Math.round((inv.taxRate || 0) * 100)}%)`, fmtMoney(inv.taxAmount, inv.currency))
  doc.setDrawColor(LINE.r, LINE.g, LINE.b); doc.setLineWidth(0.3)
  doc.line(totalsX, ty - 2, pageW - margin, ty - 2)
  ty += 2
  totalLine(L.total, fmtMoney(inv.total, inv.currency), true)

  // ── Terms ───────────────────────────────────────────────────────────────────
  // What the client is asked to do, in their language — and nothing on an
  // invoice that is already settled or cancelled.
  const terms = termsSentence(locale, inv)
  if (terms) {
    ty += 2
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(INK.r, INK.g, INK.b)
    for (const l of doc.splitTextToSize(terms, pageW - margin * 2)) { doc.text(l, pageW - margin, ty, { align: "right" }); ty += 4 }
  }

  // ── Pay to — the issuing company's bank, in the invoice's currency where it has one ──
  if (from.paymentLines.length) {
    ty += 6
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b)
    doc.text(upper(L.payTo), margin, ty, { charSpace: 0.4 }); ty += 5
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(INK.r, INK.g, INK.b)
    for (const l of from.paymentLines) { doc.text(l, margin, ty); ty += 4 }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (inv.notes && inv.notes.trim()) {
    ty += 6
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b)
    doc.text(upper(L.notes), margin, ty, { charSpace: 0.4 }); ty += 5
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    for (const l of doc.splitTextToSize(inv.notes, pageW - margin * 2)) { doc.text(l, margin, ty); ty += 4 }
  }

  // ── Footer, on every page ───────────────────────────────────────────────────
  // A long invoice runs onto a second page; each one says whose it is and
  // "page x of y", so a page that comes loose from the others can be put back.
  const pageH = doc.internal.pageSize.getHeight()
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    doc.text(`${from.name || L.company} · ${inv.invoiceNumber}`, margin, pageH - 8)
    doc.text(fillLabel(L.page, { page: p, pages }), pageW - margin, pageH - 8, { align: "right" })
  }

  drawStatusStamp(doc, inv.status, L, locale, pageW, pageH, margin)
  return doc
}

/** Download the invoice as a PDF file. */
export async function exportInvoicePdf(inv: InvoicePdfData, branding: InvoiceBranding): Promise<void> {
  const doc = await buildDoc(inv, branding)
  doc.save(pdfFileName([
    fileNamePart(inv.clientName),
    fileNamePart(invoiceDocumentLabels(inv.locale ?? null).invoice),
    fileNamePart(inv.invoiceNumber),
    periodPart(inv.servicePeriodFrom, inv.servicePeriodTo) || dayKeyOf(inv.issueDate),
  ], "invoice"))
}

/** Render the invoice to a blob URL (for print / preview in a new window). */
export async function renderInvoicePdfUrl(inv: InvoicePdfData, branding: InvoiceBranding): Promise<string> {
  const doc = await buildDoc(inv, branding)
  return doc.output("bloburl") as unknown as string
}
