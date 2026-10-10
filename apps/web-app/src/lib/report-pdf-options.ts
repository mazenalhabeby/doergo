/**
 * What the report export dialog needs to DRAW its choices — the template
 * catalogue, the custom options and their defaults — without the renderer.
 *
 * Split out of report-pdf.ts so the dialog can be in the reports page while
 * jsPDF (~350 kB) loads only when a preview or a download is asked for.
 * report-pdf.ts re-exports everything here, so its callers are unchanged.
 */

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

export type PaperSize = "a4" | "letter"
export type HeaderStyle = "line" | "band" | "minimal"
export type Density = "comfortable" | "compact"

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
  signatureDate?: string
  pageNumbers: boolean
  heading?: string
  note?: string
}

/** Sensible defaults for a fresh custom config. */
export const DEFAULT_CUSTOM_PDF: CustomPdfOptions = {
  accent: "#2563EB", orientation: "portrait", paper: "a4", font: "sans", density: "comfortable",
  headerStyle: "line", logo: true, summary: true, summaryPosition: "top", chart: true, table: true, signature: false, pageNumbers: true,
  heading: "", note: "", signatureDate: "",
}

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
