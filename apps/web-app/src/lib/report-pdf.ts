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

export type PdfTemplate = "classic" | "executive" | "data" | "presentation" | "custom"

interface RGB { r: number; g: number; b: number }

export type PaperSize = "a4" | "letter"
export type HeaderStyle = "line" | "band" | "minimal"
export type Density = "comfortable" | "compact"

/** Fully-resolved render config. Templates are presets over this shape. */
export interface PdfConfig {
  accent: RGB
  orientation: "portrait" | "landscape"
  paper: PaperSize
  font: "helvetica" | "times" // jsPDF built-in families (sans / serif)
  density: Density
  headerStyle: HeaderStyle
  logo: boolean
  summary: boolean // KPI totals cards
  summaryPosition: "top" | "bottom" // render the KPI cards above the table or after it
  chart: boolean // bar chart of the first measure
  table: boolean
  signature: boolean // signature block at the end
  pageNumbers: boolean
  heading?: string // overrides the report title in the document
  note?: string // short intro / disclaimer under the title
}

/** Custom options surfaced in the UI for higher-tier users. */
export interface CustomPdfOptions {
  accent: string // hex, e.g. "#2563EB"
  orientation: "portrait" | "landscape"
  paper: PaperSize
  font: "sans" | "serif"
  density: Density
  headerStyle: HeaderStyle
  logo: boolean
  summary: boolean
  summaryPosition: "top" | "bottom"
  chart: boolean
  table: boolean
  signature: boolean
  pageNumbers: boolean
  heading?: string
  note?: string
}

/** Sensible defaults for a fresh custom config. */
export const DEFAULT_CUSTOM_PDF: CustomPdfOptions = {
  accent: "#2563EB", orientation: "portrait", paper: "a4", font: "sans", density: "comfortable",
  headerStyle: "line", logo: true, summary: true, summaryPosition: "top", chart: true, table: true, signature: false, pageNumbers: true,
  heading: "", note: "",
}

const BLUE: RGB = { r: 37, g: 99, b: 235 } // #2563EB (blue-600)
const SLATE: RGB = { r: 51, g: 65, b: 85 } // slate-700
const INK: RGB = { r: 30, g: 41, b: 59 } // slate-800
const MUTED: RGB = { r: 100, g: 116, b: 139 } // slate-500

export interface PdfTemplateMeta {
  key: PdfTemplate
  name: string
  description: string
}

/** Catalog shown in the export dialog. `custom` is appended only for eligible tiers. */
export const PDF_TEMPLATES: PdfTemplateMeta[] = [
  { key: "classic", name: "Classic", description: "Letterhead, chart preview, and full data table." },
  { key: "executive", name: "Executive summary", description: "KPI totals up top, chart, and a compact table." },
  { key: "data", name: "Data table", description: "Dense landscape table — no chart, best for wide reports." },
  { key: "presentation", name: "Presentation", description: "Bold colored header band, KPIs, big chart and table." },
]

export const CUSTOM_PDF_TEMPLATE: PdfTemplateMeta = {
  key: "custom",
  name: "Custom",
  description: "Choose colors, orientation, and which sections to include.",
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return BLUE
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function baseCfg(): Omit<PdfConfig, "accent"> {
  return {
    orientation: "portrait", paper: "a4", font: "helvetica", density: "comfortable", headerStyle: "line",
    logo: true, summary: false, summaryPosition: "top", chart: true, table: true, signature: false, pageNumbers: true,
  }
}

function presetFor(template: PdfTemplate, custom?: CustomPdfOptions): PdfConfig {
  switch (template) {
    case "executive":
      return { ...baseCfg(), accent: BLUE, summary: true }
    case "data":
      return { ...baseCfg(), accent: SLATE, orientation: "landscape", headerStyle: "minimal", density: "compact", chart: false, summary: false }
    case "presentation":
      return { ...baseCfg(), accent: BLUE, headerStyle: "band", summary: true }
    case "custom":
      return {
        accent: custom ? hexToRgb(custom.accent) : BLUE,
        orientation: custom?.orientation ?? "portrait",
        paper: custom?.paper ?? "a4",
        font: custom?.font === "serif" ? "times" : "helvetica",
        density: custom?.density ?? "comfortable",
        headerStyle: custom?.headerStyle ?? "line",
        logo: custom?.logo ?? true,
        summary: custom?.summary ?? false,
        summaryPosition: custom?.summaryPosition ?? "top",
        chart: custom?.chart ?? true,
        table: custom?.table ?? true,
        signature: custom?.signature ?? false,
        pageNumbers: custom?.pageNumbers ?? true,
        heading: custom?.heading?.trim() || undefined,
        note: custom?.note?.trim() || undefined,
      }
    case "classic":
    default:
      return { ...baseCfg(), accent: BLUE }
  }
}

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

/**
 * Build the KPI cards: one per measure column (sum, or average for percentages),
 * plus a dynamic "Days worked" card for timesheet-style reports — the number of
 * days that actually have hours logged. So a timesheet summary shows both the
 * total hours AND how many days were worked.
 */
function summarize(result: ReportResult): { label: string; value: string }[] {
  const cards = result.columns
    .filter((c) => c.kind === "measure")
    .map((c) => {
      const nums = result.rows.map((r) => Number(r[c.key]) || 0)
      const total = nums.reduce((a, b) => a + b, 0)
      const value = c.format === "percent" && nums.length ? total / nums.length : total
      return { label: c.label, value: fmt(value, c.format) }
    })

  // Days worked — only meaningful when the report tracks hours per day (timesheet).
  const hoursCol = result.columns.find((c) => c.format === "hours")
  if (hoursCol) {
    const daysWorked = result.rows.reduce((n, r) => n + ((Number(r[hoursCol.key]) || 0) > 0 ? 1 : 0), 0)
    cards.push({ label: "Days worked", value: String(daysWorked) })
  }

  // Period — the actual date span covered, e.g. "01/07/2026 - 31/07/2026",
  // read from the first date-like column (min → max), shown as the first card.
  const dateCol = result.columns.find(
    (c) =>
      (c.kind === "period" || c.kind === "dimension") &&
      result.rows.some((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r[c.key] ?? ""))),
  )
  if (dateCol && result.rows.length) {
    const dates = result.rows
      .map((r) => String(r[dateCol.key] ?? "").slice(0, 10))
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
      .sort()
    if (dates.length) {
      const dmy = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}` }
      const first = dmy(dates[0]!), last = dmy(dates[dates.length - 1]!)
      cards.unshift({ label: "Period", value: first === last ? first : `${first} - ${last}` })
    }
  }
  return cards
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
  // When a report is scoped to a single customer, their details render as a
  // "Prepared for" block under the title (turns any report into a statement).
  preparedFor?: { name: string; lines: string[] }
}

/**
 * Build a branded PDF of a report result using one of four templates (or a
 * fully custom config). Renders company letterhead, optional KPI summary +
 * chart, the data table, and a paginated footer. Returns the jsPDF doc plus a
 * suggested filename — callers save it or render a preview.
 */
async function buildDoc(
  result: ReportResult,
  meta: ReportPdfMeta,
  branding: ReportBranding,
  template: PdfTemplate,
  custom?: CustomPdfOptions,
): Promise<{ doc: jsPDF; filename: string }> {
  const cfg = presetFor(template, custom)
  const FF = cfg.font // "helvetica" (sans) | "times" (serif)
  const doc = new jsPDF({ orientation: cfg.orientation, unit: "mm", format: cfg.paper })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  const contentW = pageW - margin * 2
  const logo = cfg.logo ? await loadLogo(branding.logoUrl) : null

  let y = margin

  // ── Letterhead ────────────────────────────────────────────────────────────
  if (cfg.headerStyle === "band") {
    // Colored band: name + address reversed out on the accent color.
    const bandH = 26
    doc.setFillColor(cfg.accent.r, cfg.accent.g, cfg.accent.b)
    doc.rect(0, 0, pageW, bandH, "F")
    let bx = margin
    if (logo) {
      const h = 14, w = (logo.w / logo.h) * h
      doc.addImage(logo.dataUrl, "PNG", margin, 6, Math.min(w, 34), h)
      bx += Math.min(w, 34) + 4
    }
    doc.setTextColor(255, 255, 255)
    doc.setFont(FF, "bold")
    doc.setFontSize(15)
    doc.text(branding.name || "Company", bx, 12)
    doc.setFont(FF, "normal")
    doc.setFontSize(8)
    doc.text(addressLines(branding).slice(0, 2).join("   "), bx, 18)
    y = bandH + 8
  } else {
    let logoW = 0
    if (logo) {
      const maxH = 16, maxW = 40, ratio = logo.w / logo.h
      let h = maxH, w = h * ratio
      if (w > maxW) { w = maxW; h = w / ratio }
      doc.addImage(logo.dataUrl, "PNG", margin, margin, w, h)
      logoW = w + 4
    }
    doc.setTextColor(INK.r, INK.g, INK.b)
    doc.setFont(FF, "bold")
    doc.setFontSize(15)
    doc.text(branding.name || "Company", margin + logoW, margin + 5)
    doc.setFont(FF, "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    let ly = margin + 10
    for (const line of addressLines(branding)) { doc.text(line, margin + logoW, ly); ly += 4 }
    y = Math.max(ly, margin + (logo ? 18 : 12))
    if (cfg.headerStyle === "line") {
      doc.setDrawColor(cfg.accent.r, cfg.accent.g, cfg.accent.b)
      doc.setLineWidth(0.8)
      doc.line(margin, y, pageW - margin, y)
      y += 8
    } else {
      y += 6 // minimal: no rule, a little breathing room
    }
  }

  // Small uppercase accent section label; advances and returns the new y.
  const sectionLabel = (text: string, atY: number): number => {
    doc.setFont(FF, "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(cfg.accent.r, cfg.accent.g, cfg.accent.b)
    doc.text(text.toUpperCase(), margin, atY, { charSpace: 0.4 })
    return atY + 4.5
  }

  // ── Title block ─────────────────────────────────────────────────────────
  doc.setFont(FF, "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(cfg.accent.r, cfg.accent.g, cfg.accent.b)
  doc.text(meta.preparedFor ? "STATEMENT" : "REPORT", margin, y, { charSpace: 0.4 })
  y += 6
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFont(FF, "bold")
  doc.setFontSize(19)
  doc.text(cfg.heading || meta.title, margin, y)
  y += 6.5
  doc.setFont(FF, "normal")
  doc.setFontSize(9)
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  const generated = `Generated ${new Date().toLocaleString()}`
  doc.text(meta.subtitle ? `${meta.subtitle}   •   ${generated}` : generated, margin, y)
  y += 4

  // ── "Prepared for" block (single-customer scoped reports) ────────────────
  if (meta.preparedFor) {
    y += 2
    doc.setFont(FF, "bold")
    doc.setFontSize(7)
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    doc.text("PREPARED FOR", margin, y, { charSpace: 0.3 })
    y += 4.5
    doc.setFontSize(11)
    doc.setTextColor(INK.r, INK.g, INK.b)
    doc.text(meta.preparedFor.name, margin, y)
    y += 4.5
    doc.setFont(FF, "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    for (const line of meta.preparedFor.lines.filter((l) => l && l.trim())) { doc.text(line, margin, y); y += 4 }
    y += 2
  }
  if (cfg.note) {
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    const wrapped = doc.splitTextToSize(cfg.note, contentW)
    doc.text(wrapped, margin, y + 2)
    y += wrapped.length * 4 + 2
  }
  y += 4

  // ── KPI summary cards (rendered at the top OR after the table) ─────────────
  const renderSummary = (atY: number): number => {
    const cards = summarize(result)
    if (!cards.length) return atY
    let yy = sectionLabel("Summary", atY)
    const gap = 3
    const perRow = Math.min(cards.length, cfg.orientation === "landscape" ? 5 : 4)
    const cardW = (contentW - gap * (perRow - 1)) / perRow
    const cardH = 18
    cards.forEach((card, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const cx = margin + col * (cardW + gap)
      const cy = yy + row * (cardH + gap)
      // Light card, no border, with an accent left bar.
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(cx, cy, cardW, cardH, 1.8, 1.8, "F")
      doc.setFillColor(cfg.accent.r, cfg.accent.g, cfg.accent.b)
      doc.roundedRect(cx, cy, 1.4, cardH, 0.7, 0.7, "F")
      doc.setFontSize(6.8)
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
      doc.setFont(FF, "bold")
      doc.text(doc.splitTextToSize(card.label.toUpperCase(), cardW - 6)[0], cx + 4, cy + 6, { charSpace: 0.2 })
      doc.setTextColor(INK.r, INK.g, INK.b)
      doc.setFont(FF, "bold")
      // Auto-fit the value so longer text (e.g. a date range) never overflows.
      let vfs = 13
      doc.setFontSize(vfs)
      while (vfs > 8 && doc.getTextWidth(card.value) > cardW - 7) { vfs -= 0.5; doc.setFontSize(vfs) }
      doc.text(card.value, cx + 4, cy + 13.5)
    })
    const rows = Math.ceil(cards.length / perRow)
    return yy + rows * (cardH + gap) + 5
  }
  if (cfg.summary && cfg.summaryPosition !== "bottom") y = renderSummary(y)

  // ── Chart (horizontal bars of the first measure) ──────────────────────────
  const measureCol = result.columns.find((c) => c.kind === "measure")
  const labelCol = result.columns.find((c) => c.kind === "period" || c.kind === "dimension")
  if (cfg.chart && measureCol && labelCol && result.rows.length) {
    y = sectionLabel(`Top ${measureCol.label}`, y)
    const maxVal = Math.max(...result.rows.map((r) => Number(r[measureCol.key]) || 0), 1)
    const top = result.rows.slice(0, 10)
    const labelW = 44
    const valW = 26
    const barX = margin + labelW
    const barMaxW = contentW - labelW - valW
    const rowH = 7.2
    const barH = 4.4
    doc.setFontSize(8)
    for (const r of top) {
      const cy = y + rowH / 2
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
      doc.setFont(FF, "normal")
      doc.text(doc.splitTextToSize(fmt(r[labelCol.key], labelCol.format), labelW - 3)[0], margin, cy + 1)
      doc.setFillColor(241, 245, 249)
      doc.roundedRect(barX, cy - barH / 2, barMaxW, barH, 1, 1, "F")
      const w = Math.max(((Number(r[measureCol.key]) || 0) / maxVal) * barMaxW, 0.8)
      doc.setFillColor(cfg.accent.r, cfg.accent.g, cfg.accent.b)
      doc.roundedRect(barX, cy - barH / 2, w, barH, 1, 1, "F")
      doc.setTextColor(INK.r, INK.g, INK.b)
      doc.setFont(FF, "bold")
      doc.text(fmt(r[measureCol.key], measureCol.format), pageW - margin, cy + 1, { align: "right" })
      y += rowH
    }
    y += 5
  }

  // ── Data table ────────────────────────────────────────────────────────────
  const dense = cfg.density === "compact"
  const pad = dense ? 1.9 : 2.8
  if (cfg.table) {
    if (cfg.chart || cfg.summary) y = sectionLabel("Details", y)
    const head = [result.columns.map((c) => c.label)]
    const body = result.rows.map((row) => result.columns.map((c) => fmt(row[c.key], c.format)))
    const columnStyles: Record<number, { halign: "right" }> = {}
    result.columns.forEach((c, i) => { if (c.kind === "measure") columnStyles[i] = { halign: "right" } })
    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: margin, right: margin },
      theme: "plain",
      styles: { font: FF, fontSize: dense ? 8 : 8.5, cellPadding: { top: pad, bottom: pad, left: 3, right: 3 }, textColor: [INK.r, INK.g, INK.b], lineColor: [237, 242, 247], lineWidth: { bottom: 0.1, top: 0, left: 0, right: 0 }, valign: "middle" },
      headStyles: { font: FF, fillColor: [cfg.accent.r, cfg.accent.g, cfg.accent.b], textColor: [255, 255, 255], fontStyle: "bold", fontSize: dense ? 7.5 : 8, cellPadding: { top: pad + 0.4, bottom: pad + 0.4, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles,
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  // ── KPI summary at the bottom (when chosen) — after the table ─────────────
  if (cfg.summary && cfg.summaryPosition === "bottom") {
    const phB = doc.internal.pageSize.getHeight()
    if (y > phB - 32) { doc.addPage(); y = margin }
    y = renderSummary(y)
  }

  // ── Signature block ───────────────────────────────────────────────────────
  if (cfg.signature) {
    const ph2 = doc.internal.pageSize.getHeight()
    if (y > ph2 - 40) { doc.addPage(); y = margin }
    y += 6
    const colW = (contentW - 12) / 2
    const sign = (label: string, x: number) => {
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.3)
      doc.line(x, y + 10, x + colW, y + 10)
      doc.setFont(FF, "normal")
      doc.setFontSize(8)
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
      doc.text(label, x, y + 14)
    }
    sign("Prepared by / Date", margin)
    sign("Received by / Date", margin + colW + 12)
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  const ph = doc.internal.pageSize.getHeight()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont(FF, "normal")
    // Page numbers (left) + org name (right).
    doc.setFontSize(8)
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    if (cfg.pageNumbers) doc.text(`Page ${p} of ${total}`, margin, ph - 8)
    doc.text(branding.name || "HBCField", pageW - margin, ph - 8, { align: "right" })
    // "Powered by HBCField" — centered SaaS mark on every page.
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184) // slate-400 (subtle)
    doc.text("Powered by HBCField", pageW / 2, ph - 8, { align: "center" })
  }

  const safe = (cfg.heading || meta.title || "report").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase()
  return { doc, filename: `${safe}-${new Date().toISOString().slice(0, 10)}.pdf` }
}

/** Build and download the PDF. */
export async function exportReportPdf(
  result: ReportResult,
  meta: ReportPdfMeta,
  branding: ReportBranding,
  template: PdfTemplate = "classic",
  custom?: CustomPdfOptions,
): Promise<void> {
  const { doc, filename } = await buildDoc(result, meta, branding, template, custom)
  doc.save(filename)
}

/** Build the PDF and return an object URL for an <iframe> preview. Revoke it when done. */
export async function renderReportPdfPreview(
  result: ReportResult,
  meta: ReportPdfMeta,
  branding: ReportBranding,
  template: PdfTemplate = "classic",
  custom?: CustomPdfOptions,
): Promise<string> {
  const { doc } = await buildDoc(result, meta, branding, template, custom)
  const blob = doc.output("blob")
  return URL.createObjectURL(blob)
}
