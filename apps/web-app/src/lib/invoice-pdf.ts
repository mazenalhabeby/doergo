import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { invoiceStamp } from "./invoice-status"

/**
 * Client-side invoice PDF, mirroring the "PDF studio" approach in report-pdf.ts
 * (jsPDF + jspdf-autotable, org letterhead with logo/address, graceful fallback
 * to name-only if the logo is CORS-blocked). Kept self-contained so it does not
 * depend on api.ts types (which change independently).
 */

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
  notes?: string | null
  items: InvoicePdfItem[]
}

const INK = { r: 30, g: 41, b: 59 } // slate-800
const MUTED = { r: 100, g: 116, b: 139 } // slate-500
const ACCENT = { r: 37, g: 99, b: 235 } // brand-600
const LINE = { r: 226, g: 232, b: 240 } // slate-200

/** Load a (possibly cross-origin) logo into a PNG data URL. Resolves null on any failure. */
async function loadLogo(url?: string | null): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img)
      img.onerror = reject
    })
    img.src = url
    const el = await Promise.race([
      loaded,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("logo timeout")), 4000)),
    ])
    const canvas = document.createElement("canvas")
    canvas.width = el.naturalWidth || el.width
    canvas.height = el.naturalHeight || el.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(el, 0, 0)
    return { dataUrl: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height }
  } catch {
    return null
  }
}

function orgAddressLines(b: InvoiceBranding): string[] {
  const line1 = b.addressLine1 || b.address || ""
  const cityLine = [b.postalCode, b.city].filter(Boolean).join(" ")
  const regionLine = [cityLine, b.state, b.country].filter(Boolean).join(", ")
  const contact = [b.phone, b.email, b.website].filter(Boolean).join("  •  ")
  return [line1, b.addressLine2 || "", regionLine, contact].filter((l) => l && l.trim().length > 0)
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency || "EUR" }).format(n || 0)
  } catch {
    return `${(n || 0).toFixed(2)} ${currency || ""}`.trim()
  }
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return "—"
  const dt = typeof d === "string" ? new Date(d) : d
  if (isNaN(dt.getTime())) return "—"
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

async function buildDoc(inv: InvoicePdfData, branding: InvoiceBranding): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 16
  const logo = await loadLogo(branding.logoUrl)

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
  doc.text(branding.name || "Company", margin + logoW, margin + 5)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  let ly = margin + 10
  for (const line of orgAddressLines(branding)) { doc.text(line, margin + logoW, ly); ly += 4 }
  if (branding.vatId) { doc.text(`VAT / UID: ${branding.vatId}`, margin + logoW, ly); ly += 4 }

  // ── "INVOICE" heading block (right-aligned) ─────────────────────────────────
  doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.text("INVOICE", pageW - margin, margin + 6, { align: "right" })
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(inv.invoiceNumber, pageW - margin, margin + 12, { align: "right" })

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
  doc.text("BILL TO", margin, y, { charSpace: 0.4 })
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
    ["Issue date", fmtDate(inv.issueDate)],
    ["Due date", inv.dueDate ? fmtDate(inv.dueDate) : "On receipt"],
  ]
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
    head: [["Description", "Qty", "Unit price", "Amount"]],
    body: inv.items.map((it) => [
      it.description,
      String(it.quantity),
      fmtMoney(it.unitPrice, inv.currency),
      fmtMoney(it.amount, inv.currency),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: [INK.r, INK.g, INK.b], lineColor: [LINE.r, LINE.g, LINE.b], lineWidth: 0.2 },
    headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 32 },
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
  totalLine("Subtotal", fmtMoney(inv.subtotal, inv.currency))
  if (inv.discount) totalLine("Discount", `- ${fmtMoney(inv.discount, inv.currency)}`)
  if (inv.taxRate) totalLine(`Tax (${Math.round((inv.taxRate || 0) * 100)}%)`, fmtMoney(inv.taxAmount, inv.currency))
  doc.setDrawColor(LINE.r, LINE.g, LINE.b); doc.setLineWidth(0.3)
  doc.line(totalsX, ty - 2, pageW - margin, ty - 2)
  ty += 2
  totalLine("Total", fmtMoney(inv.total, inv.currency), true)

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (inv.notes && inv.notes.trim()) {
    ty += 6
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b)
    doc.text("NOTES", margin, ty, { charSpace: 0.4 }); ty += 5
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    for (const l of doc.splitTextToSize(inv.notes, pageW - margin * 2)) { doc.text(l, margin, ty); ty += 4 }
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  doc.text(`${branding.name || "Company"} · ${inv.invoiceNumber}`, margin, pageH - 8)

  drawStatusStamp(doc, inv.status, pageW, pageH, margin)
  return doc
}

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
 *   PAID      conventional, and useful to whoever opens the file later.
 *
 * SENT, OVERDUE and REFUNDED are deliberately not drawn. Beyond meaning little
 * to the reader, they go STALE: a PDF is a frozen copy that outlives the state
 * it was generated in, so one stamped OVERDUE still says so a year after it was
 * settled. A status that can change must not be baked into a file.
 */
function drawStatusStamp(
  doc: jsPDF,
  status: string,
  pageW: number,
  pageH: number,
  margin: number,
): void {
  const stamp = invoiceStamp(status)
  if (!stamp) return

  // Diagonal across the page, behind nothing and over everything — a watermark
  // that has to be read rather than found.
  doc.saveGraphicsState()
  // @ts-expect-error — GState is provided by jsPDF at runtime, not in its types.
  doc.setGState(new doc.GState({ opacity: 0.16 }))
  doc.setFont("helvetica", "bold")
  doc.setFontSize(74)
  doc.setTextColor(stamp.color.r, stamp.color.g, stamp.color.b)
  doc.text(stamp.text, pageW / 2, pageH / 2, { align: "center", angle: 32 })
  doc.restoreGraphicsState()

  // And once more, small and solid under the invoice number, so it survives
  // being printed in greyscale or read on a phone at thumbnail size.
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(stamp.color.r, stamp.color.g, stamp.color.b)
  // Directly beneath the invoice number, which sits at margin + 12.
  doc.text(stamp.text, pageW - margin, margin + 17, { align: "right" })
}

/** Download the invoice as a PDF file. */
export async function exportInvoicePdf(inv: InvoicePdfData, branding: InvoiceBranding): Promise<void> {
  const doc = await buildDoc(inv, branding)
  doc.save(`${inv.invoiceNumber || "invoice"}.pdf`)
}

/** Render the invoice to a blob URL (for print / preview in a new window). */
export async function renderInvoicePdfUrl(inv: InvoicePdfData, branding: InvoiceBranding): Promise<string> {
  const doc = await buildDoc(inv, branding)
  return doc.output("bloburl") as unknown as string
}
