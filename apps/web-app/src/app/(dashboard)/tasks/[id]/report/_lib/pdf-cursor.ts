import type jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { PDF_PALETTE, PDF_TABLE_THEME, pdfSafeText, type LoadedImage, type Rgb } from "@/lib/pdf-common"

import type { NumberedSection } from "./report-model"

/**
 * The page being drawn on and where the pen is.
 *
 * The builder used to keep `y` in a local that a dozen closures moved; it is
 * one field here, and every drawing helper takes the cursor it moves. Same
 * page geometry, same page-break rule (`ensure`), same pen movements.
 */
export interface PdfCursor {
  doc: jsPDF
  y: number
  pageW: number
  pageH: number
  margin: number
  contentW: number
  top: number
  bottom: number
}

const { INK, LINE, ACCENT, MUTED } = PDF_PALETTE

export function createCursor(doc: jsPDF): PdfCursor {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 16
  return {
    doc,
    y: margin,
    pageW,
    pageH,
    margin,
    contentW: pageW - margin * 2,
    top: margin + 10, // below the small running header on later pages
    bottom: pageH - 16,
  }
}

export const s = (v: string | null | undefined) => pdfSafeText(v ?? "")

export const ink = (c: PdfCursor, color: Rgb) => c.doc.setTextColor(color.r, color.g, color.b)

export function font(c: PdfCursor, style: "normal" | "bold", size: number, color: Rgb = INK) {
  c.doc.setFont("helvetica", style)
  c.doc.setFontSize(size)
  ink(c, color)
}

/** A block asks for its full height first, so nothing is split across a page. */
export function ensure(c: PdfCursor, h: number) {
  if (c.y + h > c.bottom) {
    c.doc.addPage()
    c.y = c.top
  }
}

export const lines = (c: PdfCursor, text: string, width: number) => c.doc.splitTextToSize(s(text), width) as string[]

const lineH = (size: number) => size * 0.42

export function paragraph(c: PdfCursor, text: string, size = 9, color: Rgb = INK, x = c.margin, width = c.contentW) {
  font(c, "normal", size, color)
  for (const l of lines(c, text, width)) {
    ensure(c, lineH(size) + 1)
    c.doc.text(l, x, c.y + lineH(size))
    c.y += lineH(size) + 0.9
  }
}

function tableEnd(c: PdfCursor) {
  // @ts-expect-error lastAutoTable is added by the autotable plugin at runtime
  c.y = (c.doc.lastAutoTable?.finalY ?? c.y) + 6
}

export function table(c: PdfCursor, opts: Parameters<typeof autoTable>[1]) {
  autoTable(c.doc, {
    ...PDF_TABLE_THEME,
    startY: c.y,
    margin: { left: c.margin, right: c.margin, top: c.top, bottom: c.pageH - c.bottom },
    rowPageBreak: "avoid",
    ...opts,
  })
  tableEnd(c)
}

export function heading(
  c: PdfCursor,
  numbers: Partial<Record<NumberedSection, number>>,
  section: NumberedSection,
  title: string,
) {
  ensure(c, 16)
  c.y += 2
  font(c, "bold", 11, ACCENT)
  c.doc.text(s(`${numbers[section] ?? ""}. ${title}`), c.margin, c.y + 4)
  c.y += 6.5
  c.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
  c.doc.setLineWidth(0.3)
  c.doc.line(c.margin, c.y, c.pageW - c.margin, c.y)
  c.y += 4
}

export function fitImage(c: PdfCursor, img: LoadedImage, x: number, yy: number, w: number, h: number) {
  const ratio = img.w / img.h
  let dw = w,
    dh = w / ratio
  if (dh > h) {
    dh = h
    dw = h * ratio
  }
  c.doc.addImage(img.dataUrl, img.format, x + (w - dw) / 2, yy + (h - dh) / 2, dw, dh)
}

export function unavailable(c: PdfCursor, x: number, yy: number, w: number, h: number, label: string) {
  c.doc.setFillColor(248, 250, 252)
  c.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
  c.doc.rect(x, yy, w, h, "FD")
  font(c, "normal", 8, MUTED)
  c.doc.text(s(label), x + w / 2, yy + h / 2, { align: "center" })
}
