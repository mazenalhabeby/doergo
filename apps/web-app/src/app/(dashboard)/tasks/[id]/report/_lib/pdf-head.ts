import { PDF_PALETTE, type loadLogo } from "@/lib/pdf-common"

import { ensure, font, ink, lines, s, type PdfCursor } from "./pdf-cursor"
import { hexToRgb, type ReportCtx } from "./pdf-context"
import { factRows, letterhead, reportFacts, reportPills, type HeadToggle } from "./report-model"

const { MUTED, ACCENT, LINE } = PDF_PALETTE

/** The letterhead — the same lines the screen prints (report-model `letterhead`). */
export function drawLetterhead(
  c: PdfCursor,
  ctx: ReportCtx,
  head: ReturnType<typeof letterhead>,
  logo: Awaited<ReturnType<typeof loadLogo>>,
) {
  const { doc, margin, pageW } = c
  const { r, t, locale, when } = ctx
  let logoW = 0
  if (logo) {
    const maxH = 16,
      maxW = 40,
      ratio = logo.w / logo.h
    let h = maxH,
      w = h * ratio
    if (w > maxW) {
      w = maxW
      h = w / ratio
    }
    doc.addImage(logo.dataUrl, "PNG", margin, margin, w, h)
    logoW = w + 4
  }
  font(c, "bold", 15)
  doc.text(s(head.name), margin + logoW, margin + 5)
  font(c, "normal", 8.5, MUTED)
  let ly = margin + 10
  for (const l of head.lines) {
    doc.text(s(l), margin + logoW, ly)
    ly += 4
  }
  font(c, "bold", 20, ACCENT)
  doc.text(s(t("tasks.report.documentTitle").toLocaleUpperCase(locale)), pageW - margin, margin + 6, { align: "right" })
  font(c, "normal", 9)
  doc.text(s(r.header.reference), pageW - margin, margin + 12, { align: "right" })
  font(c, "normal", 8.5, MUTED)
  doc.text(s(t("tasks.report.issued", { date: when(r.meta.generatedAt) })), pageW - margin, margin + 17, {
    align: "right",
  })
  if (r.meta.copy === "client") {
    doc.text(s(t("tasks.report.copy.client")), pageW - margin, margin + 21.5, { align: "right" })
  }
  c.y = Math.max(ly, margin + 24) + 4
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setLineWidth(0.8)
  doc.line(margin, c.y, pageW - margin, c.y)
  c.y += 8
}

/** The job's title and its labels (status, priority, …) as outlined pills. */
export function drawTitleAndPills(c: PdfCursor, ctx: ReportCtx, headOff: ReadonlySet<HeadToggle>) {
  const { doc, margin, pageW, contentW } = c
  const { r, t } = ctx
  font(c, "bold", 16)
  for (const l of lines(c, r.header.title, contentW)) {
    doc.text(l, margin, c.y + 5)
    c.y += 7
  }
  c.y += 1
  const pills = reportPills(r, headOff, t).map((p) => ({
    text: p.text,
    color: p.key === "status" && p.hex ? hexToRgb(p.hex) : p.key === "priority" ? MUTED : ACCENT,
  }))
  let px = margin
  font(c, "bold", 8)
  for (const p of pills) {
    const text = s(p.text)
    const w = doc.getTextWidth(text) + 6
    if (px + w > pageW - margin) {
      px = margin
      c.y += 7
    }
    doc.setDrawColor(p.color.r, p.color.g, p.color.b)
    doc.setLineWidth(0.3)
    doc.roundedRect(px, c.y, w, 5.5, 2.75, 2.75, "S")
    ink(c, p.color)
    doc.text(text, px + 3, c.y + 3.9)
    px += w + 2
  }
  c.y += pills.length ? 11 : 3
}

/** Detail boxes, 4 columns; an empty box is never printed, so rows close up. */
export function drawFacts(c: PdfCursor, ctx: ReportCtx, headOff: ReadonlySet<HeadToggle>) {
  const { doc, margin, contentW } = c
  const { r, t, locale, when } = ctx
  const facts = reportFacts(r, headOff, t, when)
  const colW = contentW / 4
  for (const row of factRows(facts, 4)) {
    const heights = row.map((f) => {
      font(c, "bold", 9)
      const v = lines(c, f.value || "—", colW - 4).length
      font(c, "normal", 8)
      const sub = f.sub ? lines(c, f.sub, colW - 4).length : 0
      return 4 + v * 4 + sub * 3.6
    })
    const rowH = Math.max(...heights) + 3
    ensure(c, rowH)
    row.forEach((f, col) => {
      const x = margin + col * colW
      let fy = c.y
      font(c, "bold", 7, MUTED)
      doc.text(s(f.label.toLocaleUpperCase(locale)), x, fy + 2.5, { charSpace: 0.3 })
      fy += 5.5
      font(c, "bold", 9)
      for (const l of lines(c, f.value || "—", colW - 4)) {
        doc.text(l, x, fy + 1)
        fy += 4
      }
      if (f.sub) {
        font(c, "normal", 8, MUTED)
        for (const l of lines(c, f.sub, colW - 4)) {
          doc.text(l, x, fy + 1)
          fy += 3.6
        }
      }
    })
    c.y += rowH
  }
  if (facts.length) c.y += 2
}

/** Running header (pages 2+) and footer (every page), drawn once the page count is known. */
export function drawPageFrames(c: PdfCursor, ctx: ReportCtx, generatedBy: string) {
  const { doc, margin, pageW, pageH, contentW } = c
  const { r, t, when } = ctx
  const pages = doc.getNumberOfPages()
  const generated = t("tasks.report.footer", { when: when(r.meta.generatedAt), who: generatedBy })
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) {
      font(c, "normal", 7.5, MUTED)
      doc.text(s(r.header.issuer.name ?? ""), margin, margin + 2)
      doc.text(s(`${t("tasks.report.documentTitle")} ${r.header.reference}`), pageW - margin, margin + 2, {
        align: "right",
      })
      doc.setDrawColor(LINE.r, LINE.g, LINE.b)
      doc.setLineWidth(0.3)
      doc.line(margin, margin + 4, pageW - margin, margin + 4)
    }
    font(c, "normal", 7.5, MUTED)
    const footer = [r.header.issuer.name, r.header.reference, generated].filter(Boolean).join(" · ")
    doc.text(lines(c, footer, contentW - 30)[0] ?? "", margin, pageH - 8)
    doc.text(s(t("tasks.report.page", { page: p, pages })), pageW - margin, pageH - 8, { align: "right" })
  }
}
