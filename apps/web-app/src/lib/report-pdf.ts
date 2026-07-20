import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { ReportResult } from "@/lib/api"

/**
 * Company branding pulled from `organizationsApi.getProfile()`. Every field is
 * optional so a half-filled org profile still renders a clean document.
 */
export interface ReportBranding {
  name?: string
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
}

const BRAND = { r: 37, g: 99, b: 235 } // #2563EB (blue-600)
const INK = { r: 30, g: 41, b: 59 } // slate-800
const MUTED = { r: 100, g: 116, b: 139 } // slate-500

/** Format a cell value the same way the on-screen table does. */
function fmt(value: unknown, format?: string): string {
  if (value == null) return "—"
  if (format === "hours") return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}h`
  if (format === "currency") return `€${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  if (format === "percent") return `${Number(value)}%`
  if (format === "number") return Number(value).toLocaleString()
  const s = String(value)
  const d = new Date(s)
  if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return d.toLocaleDateString()
  return s
}

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
    return null // remote logo blocked by CORS / missing → fall back to name only
  }
}

function addressLines(b: ReportBranding): string[] {
  const line1 = b.addressLine1 || b.address || ""
  const cityLine = [b.postalCode, b.city].filter(Boolean).join(" ")
  const regionLine = [cityLine, b.state, b.country].filter(Boolean).join(", ")
  const contact = [b.phone, b.email, b.website].filter(Boolean).join("  •  ")
  return [line1, b.addressLine2 || "", regionLine, contact].filter((l) => l && l.trim().length > 0)
}

export interface ReportPdfMeta {
  title: string
  subtitle?: string // e.g. date-range label
}

/**
 * Build and download a branded PDF of a report result — company letterhead,
 * report title, the full data table, and paginated footer.
 */
export async function exportReportPdf(result: ReportResult, meta: ReportPdfMeta, branding: ReportBranding): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  const logo = await loadLogo(branding.logoUrl)

  // ── Letterhead ────────────────────────────────────────────────────────────
  let headerBottom = margin
  const textX = margin
  let logoW = 0
  if (logo) {
    const maxH = 16
    const maxW = 40
    const ratio = logo.w / logo.h
    let h = maxH
    let w = h * ratio
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
  for (const line of addressLines(branding)) {
    doc.text(line, margin + logoW, ly)
    ly += 4
  }
  headerBottom = Math.max(ly, margin + (logo ? 18 : 12))

  // Brand rule under the letterhead
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b)
  doc.setLineWidth(0.8)
  doc.line(margin, headerBottom, pageW - margin, headerBottom)

  // ── Title block ─────────────────────────────────────────────────────────
  let y = headerBottom + 8
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(meta.title, margin, y)
  y += 6
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  const generated = `Generated ${new Date().toLocaleString()}`
  doc.text(meta.subtitle ? `${meta.subtitle}   •   ${generated}` : generated, margin, y)
  y += 4

  // ── Data table ────────────────────────────────────────────────────────────
  const head = [result.columns.map((c) => c.label)]
  const body = result.rows.map((row) => result.columns.map((c) => fmt(row[c.key], c.format)))
  const measureCols = result.columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.kind === "measure")
  const columnStyles: Record<number, { halign: "right" }> = {}
  for (const { i } of measureCols) columnStyles[i] = { halign: "right" }

  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: [INK.r, INK.g, INK.b], lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
  })

  // ── Footer on every page (page total is known only after the table lays out) ──
  const total = doc.getNumberOfPages()
  const ph = doc.internal.pageSize.getHeight()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    doc.setFont("helvetica", "normal")
    doc.text(`Page ${p} of ${total}`, margin, ph - 8)
    doc.text("HBCField", pageW - margin, ph - 8, { align: "right" })
  }

  const safe = (meta.title || "report").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase()
  doc.save(`${safe}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
