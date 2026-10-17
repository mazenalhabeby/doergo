import { personName, type TaskReportPhoto } from "@hbcfield/shared/client"

import { PDF_PALETTE } from "@/lib/pdf-common"

import { ensure, fitImage, font, heading, lines, paragraph, s, table, unavailable, type PdfCursor } from "./pdf-cursor"
import { TIME_TONE, type ReportCtx } from "./pdf-context"
import { formatReportMinutes, pairPhotos, workSteps } from "./report-model"

const { INK, MUTED } = PDF_PALETTE

export function drawRequest(c: PdfCursor, ctx: ReportCtx) {
  const { r, t } = ctx
  heading(c, ctx.numbers, "request", t("tasks.report.sections.request"))
  paragraph(c, r.request.description?.trim() || t("tasks.report.request.none"), 9, r.request.description ? INK : MUTED)
  c.y += 3
}

export function drawWork(c: PdfCursor, ctx: ReportCtx) {
  const { doc, margin, contentW } = c
  const { r, t, when } = ctx
  const w = r.work!
  heading(c, ctx.numbers, "work", t("tasks.report.sections.work"))
  font(c, "bold", 9.5)
  paragraph(c, w.summary, 9.5)
  c.y += 1.5
  const steps = workSteps(w.workPerformed)
  if (steps) {
    steps.forEach((st, i) => {
      font(c, "normal", 9)
      const ls = lines(c, st, contentW - 8)
      ensure(c, ls.length * 4.6)
      doc.text(`${i + 1}.`, margin, c.y + 3.8)
      for (const l of ls) {
        doc.text(l, margin + 7, c.y + 3.8)
        c.y += 4.6
      }
    })
  } else if (w.workPerformed) paragraph(c, w.workPerformed)
  c.y += 1.5
  const completed = t("tasks.report.work.completed", {
    who: personName(w.completedBy) || "—",
    when: when(w.completedAt),
  })
  paragraph(c, completed, 8, MUTED)
  c.y += 3
}

export function drawTime(c: PdfCursor, ctx: ReportCtx) {
  const { doc, margin, contentW, pageW } = c
  const { r, t, when } = ctx
  const tm = r.time!
  heading(c, ctx.numbers, "time", t("tasks.report.sections.time"))
  ensure(c, 16)
  const boxW = contentW / 3
  ;(["working", "travel", "blocked"] as const).forEach((k, i) => {
    const x = margin + i * boxW
    font(c, "bold", 8, TIME_TONE[k])
    doc.text(s(t(`tasks.jobTime.${k}`)), x, c.y + 3)
    font(c, "bold", 13)
    doc.text(s(formatReportMinutes(tm.total[k], t)), x, c.y + 10)
  })
  c.y += 15
  if (tm.byPerson?.length) {
    const max = Math.max(1, ...tm.byPerson.map((p) => p.travel + p.working + p.blocked))
    const nameW = 48,
      valW = 40,
      barW = contentW - nameW - valW - 4
    for (const p of tm.byPerson) {
      ensure(c, 7)
      font(c, "normal", 8.5)
      doc.text(lines(c, personName(p.person), nameW - 2)[0] ?? "", margin, c.y + 3.6)
      let bx = margin + nameW
      for (const k of ["working", "travel", "blocked"] as const) {
        const bw = (p[k] / max) * barW
        if (bw > 0) {
          doc.setFillColor(TIME_TONE[k].r, TIME_TONE[k].g, TIME_TONE[k].b)
          doc.rect(bx, c.y + 1.2, bw, 3, "F")
          bx += bw
        }
      }
      font(c, "normal", 8, MUTED)
      doc.text(s(formatReportMinutes(p.travel + p.working + p.blocked, t)), pageW - margin, c.y + 3.6, {
        align: "right",
      })
      c.y += 6
    }
    c.y += 2
  }
  if (tm.ownStops?.length) {
    const head = ["stopWho", "stopAt", "stopReason", "stopResumed"].map((k) => t(`tasks.report.time.${k}`))
    table(c, {
      head: [head.map(s)],
      body: tm.ownStops.map((o) =>
        [personName(o.person), when(o.at), o.reason ?? "—", o.resumedAt ? when(o.resumedAt) : "—"].map(s),
      ),
    })
  }
  c.y += 2
}

export function drawPhotos(c: PdfCursor, ctx: ReportCtx) {
  const { doc, margin, contentW } = c
  const { r, t, locale, when, photoImgs } = ctx
  heading(c, ctx.numbers, "photos", t("tasks.report.sections.photos"))
  const { pairs, rest } = pairPhotos(r.photos ?? [])
  const meta = (p: TaskReportPhoto) => [personName(p.by), when(p.createdAt)].filter((x) => x && x !== "—").join(" · ")
  const gap = 6
  for (const pair of pairs) {
    const w = (contentW - gap) / 2,
      ih = 62
    ensure(c, ih + 20)
    ;[pair.before, pair.after].forEach((p, i) => {
      const x = margin + i * (w + gap)
      font(c, "bold", 7.5, p.source === "BEFORE" ? MUTED : TIME_TONE.working)
      const label = t(p.source === "BEFORE" ? "tasks.report.photos.before" : "tasks.report.photos.after")
      doc.text(s(label.toLocaleUpperCase(locale)), x, c.y + 3)
      const img = photoImgs.get(p.id)
      if (img) fitImage(c, img, x, c.y + 5, w, ih)
      else unavailable(c, x, c.y + 5, w, ih, t("tasks.report.photos.unavailable"))
      let cy = c.y + ih + 9
      if (p.caption) {
        font(c, "normal", 8.5)
        doc.text(lines(c, p.caption, w)[0] ?? "", x, cy)
        cy += 4
      }
      font(c, "normal", 7.5, MUTED)
      doc.text(s(meta(p)), x, cy)
    })
    c.y += ih + 20
  }
  const cols = 3,
    w = (contentW - gap * (cols - 1)) / cols,
    ih = w * 0.75
  for (let i = 0; i < rest.length; i += cols) {
    ensure(c, ih + 12)
    rest.slice(i, i + cols).forEach((p, col) => {
      const x = margin + col * (w + gap)
      const img = photoImgs.get(p.id)
      if (img) fitImage(c, img, x, c.y, w, ih)
      else unavailable(c, x, c.y, w, ih, t("tasks.report.photos.unavailable"))
      font(c, "normal", 7.5, MUTED)
      const label = p.source === "STEP" && p.fieldLabel ? p.fieldLabel : (p.caption ?? "")
      if (label) doc.text(lines(c, label, w)[0] ?? "", x, c.y + ih + 4)
      doc.text(lines(c, meta(p), w)[0] ?? "", x, c.y + ih + (label ? 7.5 : 4))
    })
    c.y += ih + 12
  }
}
