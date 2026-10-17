import type jsPDF from "jspdf"
import { personName, type TaskReport } from "@hbcfield/shared/client"

import { PDF_PALETTE, rgbTuple } from "@/lib/pdf-common"
import { formatAmount } from "@/lib/money"
import { stepFieldLabel } from "@/lib/step-forms"

import { ensure, font, heading, lines, paragraph, s, table, type PdfCursor } from "./pdf-cursor"
import { hexToRgb, type ReportCtx } from "./pdf-context"
import {
  answerText,
  eventDotHex,
  eventSentence,
  formatDayHeading,
  formatReportDistance,
  groupEventsByDay,
  partsTotal,
  routePath,
  statusLabel,
} from "./report-model"

const { INK, MUTED, ACCENT, LINE } = PDF_PALETTE

export function drawChecklist(c: PdfCursor, ctx: ReportCtx) {
  const { r, t, when } = ctx
  heading(c, ctx.numbers, "checklist", t("tasks.report.sections.checklist"))
  const head = [
    "",
    t("tasks.report.checklist.item"),
    t("tasks.report.checklist.doneBy"),
    t("tasks.report.checklist.when"),
  ]
  table(c, {
    head: [head.map(s)],
    body: (r.checklist ?? []).map((item) =>
      [
        item.isCompleted ? "x" : "",
        item.owner ? `${item.text}\n${t("tasks.report.checklist.owner", { name: personName(item.owner) })}` : item.text,
        personName(item.completedBy) || "—",
        item.completedAt ? when(item.completedAt) : "—",
      ].map(s),
    ),
    columnStyles: {
      0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 38 },
      3: { cellWidth: 38 },
    },
  })
}

export function drawStepAnswers(c: PdfCursor, ctx: ReportCtx) {
  const { doc, margin, pageW } = c
  const { r, t, locale, when } = ctx
  heading(c, ctx.numbers, "stepAnswers", t("tasks.report.sections.stepAnswers"))
  const tr = (k: string, fb: string) => t(k, { defaultValue: fb })
  for (const sub of r.stepAnswers ?? []) {
    ensure(c, 14)
    font(c, "bold", 9.5)
    doc.text(s(statusLabel(sub.statusKey, r.header.statuses)), margin, c.y + 4)
    font(c, "normal", 8, MUTED)
    const by = [personName(sub.submittedBy), when(sub.submittedAt)].filter(Boolean).join(" · ")
    doc.text(s(by), pageW - margin, c.y + 4, { align: "right" })
    c.y += 6
    table(c, {
      body: sub.fields.map((f) => [stepFieldLabel(f, tr), answerText(f, t, locale)].map(s)),
      columnStyles: { 0: { cellWidth: 58, textColor: rgbTuple(MUTED) } },
    })
  }
}

export function drawParts(c: PdfCursor, ctx: ReportCtx) {
  const { r, t, locale, showPrices } = ctx
  heading(c, ctx.numbers, "parts", t("tasks.report.sections.parts"))
  const parts = r.parts ?? []
  const money = (n: number | null | undefined) => (n == null ? "—" : formatAmount(n, r.header.currency, locale))
  const head = [t("tasks.report.parts.part"), t("tasks.report.parts.number"), t("tasks.report.parts.qty")]
  if (showPrices) head.push(t("tasks.report.parts.unit"), t("tasks.report.parts.total"))
  const totalAll = partsTotal(parts)
  table(c, {
    head: [head.map(s)],
    body: parts.map((p) => {
      const row = [p.notes ? `${p.name}\n${p.notes}` : p.name, p.partNumber ?? "—", String(p.quantity)]
      if (showPrices) row.push(money(p.unitPrice), money(p.lineTotal))
      return row.map(s)
    }),
    ...(showPrices && totalAll != null
      ? {
          foot: [[t("tasks.report.parts.sum"), "", "", "", money(totalAll)].map(s)],
          footStyles: { fillColor: [248, 250, 252], textColor: rgbTuple(INK), fontStyle: "bold" },
        }
      : {}),
    columnStyles: {
      2: { halign: "right", cellWidth: 16 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 30 },
    },
  })
}

export function drawRouteSection(c: PdfCursor, ctx: ReportCtx) {
  const { doc, margin, contentW } = c
  const { r, t, locale, when } = ctx
  const rt = r.route!
  heading(c, ctx.numbers, "route", t("tasks.report.sections.route"))
  const boxH = 70
  ensure(c, boxH + 22)
  drawRoute(doc, rt, margin, c.y, contentW, boxH)
  c.y += boxH + 4
  const arrival = rt.arrivalDistanceMeters != null ? formatReportDistance(rt.arrivalDistanceMeters, locale) : "—"
  const facts2 = [
    [t("tasks.report.route.distance"), formatReportDistance(rt.distanceMeters, locale)],
    [t("tasks.report.route.from"), `${when(rt.startedAt)} -> ${when(rt.endedAt)}`],
    [t("tasks.report.route.arrival"), arrival],
    [t("tasks.report.route.points"), String(rt.pointCount)],
  ]
  const cw = contentW / 4
  facts2.forEach(([label, value], i) => {
    font(c, "bold", 7, MUTED)
    doc.text(s(label!.toLocaleUpperCase(locale)), margin + i * cw, c.y + 2.5)
    font(c, "bold", 8.5)
    doc.text(lines(c, value!, cw - 3)[0] ?? "", margin + i * cw, c.y + 7)
  })
  c.y += 13
}

export function drawHistory(c: PdfCursor, ctx: ReportCtx) {
  const { doc, margin, contentW } = c
  const { r, t, locale, tz } = ctx
  heading(c, ctx.numbers, "history", t("tasks.report.sections.history"))
  if (r.meta.historyTruncated) paragraph(c, t("tasks.report.history.truncated"), 8, MUTED)
  for (const day of groupEventsByDay(r.history, tz)) {
    ensure(c, 12)
    font(c, "bold", 8.5)
    doc.text(s(formatDayHeading(day.day, locale)), margin, c.y + 4)
    c.y += 6.5
    for (const { event, time } of day.items) {
      const sentence = eventSentence(event, r.header.statuses, t)
      const who = personName(event.actor)
      font(c, "normal", 8.5)
      const ls = lines(c, who ? `${sentence} · ${who}` : sentence, contentW - 20)
      ensure(c, ls.length * 4 + 1.5)
      font(c, "normal", 8, MUTED)
      doc.text(time, margin, c.y + 3.2)
      const dot = hexToRgb(eventDotHex(event, r.header.statuses))
      doc.setFillColor(dot.r, dot.g, dot.b)
      doc.circle(margin + 13.5, c.y + 2.2, 1.1, "F")
      font(c, "normal", 8.5)
      for (const l of ls) {
        doc.text(l, margin + 17, c.y + 3.2)
        c.y += 4
      }
      c.y += 1
    }
    c.y += 2
  }
}

/** The route as a line in a box — no tiles, nothing fetched: the shape of the drive. */
function drawRoute(doc: jsPDF, rt: NonNullable<TaskReport["route"]>, x: number, y: number, w: number, h: number) {
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(LINE.r, LINE.g, LINE.b)
  doc.setLineWidth(0.2)
  doc.rect(x, y, w, h, "FD")
  const path = routePath(rt)
  if (path.length < 2) return
  const lats = path.map((p) => p[0]),
    lngs = path.map((p) => p[1])
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats),
    minLng = Math.min(...lngs),
    maxLng = Math.max(...lngs)
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const spanX = Math.max((maxLng - minLng) * Math.cos(midLat), 1e-6),
    spanY = Math.max(maxLat - minLat, 1e-6)
  const pad = 6
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  const ox = x + (w - spanX * scale) / 2,
    oy = y + (h - spanY * scale) / 2
  const pt = ([lat, lng]: [number, number]) =>
    [ox + (lng - minLng) * Math.cos(midLat) * scale, oy + (maxLat - lat) * scale] as const
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setLineWidth(0.9)
  doc.setLineCap("round")
  doc.setLineJoin("round")
  for (let i = 1; i < path.length; i++) {
    const a = pt(path[i - 1]!),
      b = pt(path[i]!)
    doc.line(a[0], a[1], b[0], b[1])
  }
  const start = pt(path[0]!),
    end = pt(path[path.length - 1]!)
  doc.setFillColor(34, 197, 94)
  doc.circle(start[0], start[1], 1.6, "F")
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.circle(end[0], end[1], 1.6, "F")
}
