import { dateLocale } from "./format-date"
import type { ReportResult } from "@/lib/api"
import {
  formatReportCell,
  type ReportBranding,
  type PdfTemplate,
  type PaperSize,
  type HeaderStyle,
  type Density,
  type CustomPdfOptions,
} from "./report-pdf-options"

/** The look of an exported report PDF (presets, colours) and its small formatters — moved here unchanged from report-pdf.ts. */
interface RGB { r: number; g: number; b: number }

/** Fully-resolved render config. Templates are presets over this shape. */
interface PdfConfig {
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
  signatureDate?: string // printed date in the signature block (empty = blank line to hand-write)
  pageNumbers: boolean
  heading?: string // overrides the report title in the document
  note?: string // short intro / disclaimer under the title
}

const BLUE: RGB = { r: 37, g: 99, b: 235 } // #2563EB (blue-600)

const SLATE: RGB = { r: 51, g: 65, b: 85 } // slate-700

export const INK: RGB = { r: 30, g: 41, b: 59 } // slate-800

export const MUTED: RGB = { r: 100, g: 116, b: 139 } // slate-500

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

export function presetFor(template: PdfTemplate, custom?: CustomPdfOptions): PdfConfig {
  switch (template) {
    case "executive":
      return { ...baseCfg(), accent: BLUE, summary: true }
    case "data":
      return { ...baseCfg(), accent: SLATE, orientation: "landscape", headerStyle: "minimal", density: "compact",
        chart: false, summary: false }
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
        signatureDate: custom?.signatureDate?.trim() || undefined,
        pageNumbers: custom?.pageNumbers ?? true,
        heading: custom?.heading?.trim() || undefined,
        note: custom?.note?.trim() || undefined,
      }
    case "classic":
    default:
      return { ...baseCfg(), accent: BLUE }
  }
}

/** Format a cell value the same way the on-screen table does — one function for both. */
export function fmt(value: unknown, format?: string): string {
  return formatReportCell(value, format, dateLocale())
}

/**
 * Build the KPI cards: one per measure column (sum, or average for percentages),
 * plus a dynamic "Days worked" card for timesheet-style reports — the number of
 * days that actually have hours logged. So a timesheet summary shows both the
 * total hours AND how many days were worked.
 */
export function summarize(result: ReportResult): { label: string; value: string }[] {
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

export function addressLines(b: ReportBranding): string[] {
  const line1 = b.addressLine1 || b.address || ""
  const cityLine = [b.postalCode, b.city].filter(Boolean).join(" ")
  const regionLine = [cityLine, b.state, b.country].filter(Boolean).join(", ")
  const contact = [b.phone, b.email, b.website].filter(Boolean).join("  •  ")
  return [line1, b.addressLine2 || "", regionLine, contact].filter((l) => l && l.trim().length > 0)
}
