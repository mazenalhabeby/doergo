import { formatFileSize, personName } from "@hbcfield/shared/client"

import { PDF_PALETTE, rgbTuple, type LoadedImage } from "@/lib/pdf-common"

import { ensure, fitImage, font, heading, lines, paragraph, s, table, unavailable, type PdfCursor } from "./pdf-cursor"
import type { ReportCtx } from "./pdf-context"
import { fileTypeBadge, formatReportMinutes, safeImageUrl, signatureName, signatureRole } from "./report-model"

const { INK, MUTED, LINE } = PDF_PALETTE

export function drawNotes(c: PdfCursor, ctx: ReportCtx, section: "comments" | "handovers") {
  const { doc, margin, contentW, pageW } = c
  const { r, t, when } = ctx
  heading(
    c,
    ctx.numbers,
    section,
    t(section === "comments" ? "tasks.report.sections.comments" : "tasks.report.sections.handovers"),
  )
  const items =
    section === "comments"
      ? (r.comments ?? []).map((n) => ({
          id: n.id,
          text: n.content,
          who: personName(n.author),
          at: n.createdAt,
          extra: "",
        }))
      : (r.handovers ?? []).map((n) => ({
          id: n.id,
          text: n.note,
          who: personName(n.author),
          at: n.createdAt,
          extra:
            n.workedMinutes != null
              ? t("tasks.report.handovers.worked", { time: formatReportMinutes(n.workedMinutes, t) })
              : "",
        }))
  for (const it of items) {
    font(c, "normal", 9)
    const ls = lines(c, it.text, contentW - 4)
    ensure(c, Math.min(ls.length, 6) * 4.2 + 7)
    font(c, "bold", 8.5)
    doc.text(s(it.who || "—"), margin, c.y + 3.4)
    font(c, "normal", 8, MUTED)
    doc.text(s([when(it.at), it.extra].filter(Boolean).join(" · ")), pageW - margin, c.y + 3.4, { align: "right" })
    c.y += 5
    paragraph(c, it.text, 9, INK, margin, contentW)
    c.y += 3
  }
}

export function drawDocuments(c: PdfCursor, ctx: ReportCtx) {
  const { r, t, locale, when } = ctx
  heading(c, ctx.numbers, "documents", t("tasks.report.sections.documents"))
  const head = ["type", "name", "size", "by"].map((k) => t(`tasks.report.documents.${k}`))
  table(c, {
    head: [head.map(s)],
    body: (r.documents ?? []).map((d) =>
      [
        fileTypeBadge(d),
        d.fileName,
        formatFileSize(d.fileSize, locale),
        [personName(d.by), when(d.createdAt)].filter(Boolean).join(" · "),
      ].map(s),
    ),
    columnStyles: {
      0: { cellWidth: 16, fontStyle: "bold" },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 56 },
    },
  })
}

export function drawDetails(c: PdfCursor, ctx: ReportCtx) {
  const { r, t } = ctx
  heading(c, ctx.numbers, "details", t("tasks.report.sections.details"))
  table(c, {
    body: (r.details ?? []).map((d) => [d.name, d.value || "—"].map(s)),
    columnStyles: { 0: { cellWidth: 58, textColor: rgbTuple(MUTED) } },
  })
}

export function drawSignatures(c: PdfCursor, ctx: ReportCtx) {
  const { doc, margin, contentW } = c
  const { r, t, when, sigImgs } = ctx
  heading(c, ctx.numbers, "signatures", t("tasks.report.sections.signatures"))
  const sigs = r.signatures ?? []
  const cols = 3,
    gap = 6,
    w = (contentW - gap * (cols - 1)) / cols,
    ih = 24
  for (let i = 0; i < sigs.length; i += cols) {
    ensure(c, ih + 20)
    sigs.slice(i, i + cols).forEach((g, col) => {
      const x = margin + col * (w + gap)
      const data = g.dataUrl && safeImageUrl(g.dataUrl)
      const img: LoadedImage | null = data
        ? { dataUrl: data, w: 3, h: 1, format: data.startsWith("data:image/png") ? "PNG" : "JPEG" }
        : (sigImgs.get(g) ?? null)
      doc.setDrawColor(LINE.r, LINE.g, LINE.b)
      doc.setLineWidth(0.2)
      doc.rect(x, c.y, w, ih)
      if (img) {
        try {
          if (data) {
            const p = doc.getImageProperties(data)
            fitImage(c, { ...img, w: p.width, h: p.height }, x + 1, c.y + 1, w - 2, ih - 2)
          } else fitImage(c, img, x + 1, c.y + 1, w - 2, ih - 2)
        } catch {
          unavailable(c, x, c.y, w, ih, t("tasks.report.photos.unavailable"))
        }
      } else unavailable(c, x, c.y, w, ih, t("tasks.report.photos.unavailable"))
      let sy = c.y + ih + 4
      font(c, "bold", 8.5)
      doc.text(lines(c, signatureName(g) || "—", w)[0] ?? "", x, sy)
      sy += 3.8
      font(c, "normal", 7.5, MUTED)
      doc.text(lines(c, signatureRole(g, r, t), w)[0] ?? "", x, sy)
      sy += 3.4
      if (g.signedAt) doc.text(s(when(g.signedAt)), x, sy)
    })
    c.y += ih + 20
  }
}
