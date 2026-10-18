import type { ReportResult } from "@/lib/api"
import {
  DEFAULT_CUSTOM_PDF,
  PDF_TEMPLATES,
  CUSTOM_PDF_TEMPLATE,
  type ReportBranding,
  type PdfTemplate,
  type PaperSize,
  type HeaderStyle,
  type Density,
  type CustomPdfOptions,
  type PdfTemplateMeta
} from "./report-pdf-options"
import { type ReportPdfMeta, buildDoc } from "./report-pdf-doc"
export { type ReportPdfMeta } from "./report-pdf-doc"

// The dialog's options live in report-pdf-options.ts (no jsPDF there); they are
// re-exported so existing imports from this module keep working.
export { DEFAULT_CUSTOM_PDF, PDF_TEMPLATES, CUSTOM_PDF_TEMPLATE }
export type { ReportBranding, PdfTemplate, PaperSize, HeaderStyle, Density, CustomPdfOptions, PdfTemplateMeta }

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
