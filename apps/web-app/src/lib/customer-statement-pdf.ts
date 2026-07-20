import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { ReportBranding } from "@/lib/report-pdf"
import type { CustomerStatement } from "@/lib/api"

const BRAND = { r: 37, g: 99, b: 235 } // #2563EB
const INK = { r: 30, g: 41, b: 59 }
const MUTED = { r: 100, g: 116, b: 139 }

async function loadLogo(url?: string | null): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    const loaded = new Promise<HTMLImageElement>((res, rej) => { img.onload = () => res(img); img.onerror = rej })
    img.src = url
    const el = await Promise.race([loaded, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))])
    const canvas = document.createElement("canvas")
    canvas.width = el.naturalWidth || el.width
    canvas.height = el.naturalHeight || el.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(el, 0, 0)
    return { dataUrl: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height }
  } catch { return null }
}

function orgLines(b: ReportBranding): string[] {
  const line1 = b.addressLine1 || b.address || ""
  const region = [[b.postalCode, b.city].filter(Boolean).join(" "), b.state, b.country].filter(Boolean).join(", ")
  const contact = [b.phone, b.email, b.website].filter(Boolean).join("  •  ")
  return [line1, b.addressLine2 || "", region, contact].filter((l) => l && l.trim())
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString()
}
const fmtHours = (h: number) => `${h.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`

export interface StatementMeta {
  periodLabel?: string // e.g. "Last 90 days"
}

/** Build + download a branded "Service Statement" PDF for one customer. */
export async function exportCustomerStatementPdf(statement: CustomerStatement, branding: ReportBranding, meta: StatementMeta = {}): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  const logo = await loadLogo(branding.logoUrl)

  // ── Letterhead ──────────────────────────────────────────────────────────
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
  for (const line of orgLines(branding)) { doc.text(line, margin + logoW, ly); ly += 4 }
  let y = Math.max(ly, margin + (logo ? 18 : 12))
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pageW - margin, y)
  y += 9

  // ── Title + "Prepared for" ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b)
  doc.text("SERVICE STATEMENT", margin, y, { charSpace: 0.5 })
  y += 7
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFontSize(17)
  doc.text(statement.customer.name, margin, y)
  y += 6

  const c = statement.customer
  const custLines = [c.contactName || "", c.address || "", [c.phone, c.email].filter(Boolean).join("  •  ")].filter((l) => l && l.trim())
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  doc.text(`Prepared for the above customer${meta.periodLabel ? `  •  ${meta.periodLabel}` : ""}  •  Generated ${new Date().toLocaleDateString()}`, margin, y)
  y += 4.5
  doc.setFontSize(8.5)
  for (const line of custLines) { doc.text(line, margin, y); y += 4 }
  y += 4

  // ── Jobs table ─────────────────────────────────────────────────────────
  const head = [["Date", "Job", "Technician", "Hours"]]
  const body = statement.jobs.map((j) => [fmtDate(j.date), j.title, j.technician, fmtHours(j.hours)])
  autoTable(doc, {
    head,
    body: body.length ? body : [["—", "No completed jobs in this period", "—", "—"]],
    startY: y,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 }, textColor: [INK.r, INK.g, INK.b], lineColor: [237, 242, 247], lineWidth: { bottom: 0.1, top: 0, left: 0, right: 0 }, valign: "middle" },
    headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: { 0: { cellWidth: 26 }, 3: { halign: "right", cellWidth: 22 } },
  })

  // ── Totals ─────────────────────────────────────────────────────────────
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(pageW - margin - 70, endY, pageW - margin, endY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(`${statement.totals.jobs} job${statement.totals.jobs === 1 ? "" : "s"}`, pageW - margin - 70, endY + 6)
  doc.text(`${fmtHours(statement.totals.hours)} total`, pageW - margin, endY + 6, { align: "right" })

  // ── Footer ─────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  const ph = doc.internal.pageSize.getHeight()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    doc.setFont("helvetica", "normal")
    doc.text(`Page ${p} of ${total}`, margin, ph - 8)
    doc.text(branding.name || "HBCField", pageW - margin, ph - 8, { align: "right" })
  }

  const safe = `statement-${statement.customer.name}`.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase()
  doc.save(`${safe}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
