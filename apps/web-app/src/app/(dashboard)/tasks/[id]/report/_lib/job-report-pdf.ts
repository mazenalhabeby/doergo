import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { TaskReport, TaskReportPhoto, TaskReportSignature } from "@hbcfield/shared/client"

import { PDF_PALETTE, PDF_TABLE_THEME, loadImage, loadLogo, pdfSafeText, rgbTuple, type LoadedImage, type Rgb } from "@/lib/pdf-common"
import { formatMoneyIn } from "@/lib/money"
import { mapWithLimit } from "@/lib/pdf-text"
import { stepFieldLabel } from "@/lib/step-forms"
import {
  answerText, eventDotHex, eventSentence, fileTypeBadge, formatDayHeading, formatFileSize, formatReportDateTime,
  formatReportDistance, formatReportMinutes, groupEventsByDay, pairPhotos, partsTotal, personName,
  reportFileName, routePath, safeImageUrl, sectionNumbers, signatureName, signatureRole, statusLabel,
  workSteps, letterhead, reportPills, reportFacts, factRows, type HeadToggle, type NumberedSection, type Translate,
} from "./report-model"

/**
 * The job report as a PDF, built on the device — the same family as the
 * invoice (palette, letterhead, table header, file naming).
 *
 * ⚠️ LOADED THROUGH `import()` ONLY. jsPDF and autotable are a few hundred KB;
 * the report page imports this file when "Download PDF" is pressed and never
 * before, so opening a report costs no PDF engine.
 *
 * It prints exactly the copy it was given and the sections the screen shows:
 * the caller passes the visible list, this draws it. Nothing here decides what
 * a client may read — the server already cut the client copy.
 *
 * ⚠️ NEVER SPLIT a photo pair, a table row or a signature block across a page:
 * each block asks for its full height first (`ensure`), and tables avoid
 * breaking rows.
 */

export interface JobReportPdfInput {
  report: TaskReport
  visible: readonly NumberedSection[]
  showPrices: boolean
  t: Translate
  locale: string
  /** Who pressed the button — the footer says who generated it. */
  generatedBy: string
  /** The top-of-report switches turned off on the screen (letterhead lines, labels, detail boxes). */
  headOff?: ReadonlySet<HeadToggle>
  onProgress?: (done: number, total: number) => void
}

const { INK, MUTED, ACCENT, LINE } = PDF_PALETTE
const TIME_TONE: Record<"travel" | "working" | "blocked", Rgb> = {
  travel: { r: 14, g: 165, b: 233 }, // sky-500
  working: { r: 34, g: 197, b: 94 }, // green-500
  blocked: { r: 245, g: 158, b: 11 }, // amber-500
}

function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return MUTED
  const n = parseInt(m[1]!, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const PHOTO_OPTS = { format: "JPEG" as const, maxEdge: 1200, quality: 0.82, timeoutMs: 15000 }

export async function buildJobReportPdf(input: JobReportPdfInput): Promise<jsPDF> {
  const { report: r, t, locale } = input
  const tz = r.header.workspace?.timezone ?? null
  const when = (iso: string | null | undefined) => formatReportDateTime(iso, tz, locale)
  const s = (v: string | null | undefined) => pdfSafeText(v ?? "")
  const visible = new Set(input.visible)
  const numbers = sectionNumbers(input.visible)
  const headOff = input.headOff ?? new Set<HeadToggle>()
  const head = letterhead(r.header.issuer, headOff, t)

  // ── images first, with progress — the only slow part ─────────────────────
  const photos = visible.has("photos") ? r.photos ?? [] : []
  const stepSigs = visible.has("signatures") ? (r.signatures ?? []).filter((g) => g.kind === "STEP" && g.url) : []
  const total = photos.length + stepSigs.length
  let done = 0
  input.onProgress?.(0, total)
  const tick = () => { done += 1; input.onProgress?.(done, total) }
  const photoImgs = new Map<string, LoadedImage | null>()
  const sigImgs = new Map<TaskReportSignature, LoadedImage | null>()
  await mapWithLimit(photos, 3, async (p) => {
    photoImgs.set(p.id, await loadImage(safeImageUrl(p.url), PHOTO_OPTS))
    tick()
  })
  await mapWithLimit(stepSigs, 3, async (g) => {
    sigImgs.set(g, await loadImage(safeImageUrl(g.url), { format: "PNG", maxEdge: 800, timeoutMs: 15000 }))
    tick()
  })
  const logo = head.logoUrl ? await loadLogo(head.logoUrl) : null

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentW = pageW - margin * 2
  const top = margin + 10 // below the small running header on later pages
  const bottom = pageH - 16
  let y = margin

  const ink = (c: Rgb) => doc.setTextColor(c.r, c.g, c.b)
  const font = (style: "normal" | "bold", size: number, color: Rgb = INK) => { doc.setFont("helvetica", style); doc.setFontSize(size); ink(color) }
  const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = top } }
  const lines = (text: string, width: number) => doc.splitTextToSize(s(text), width) as string[]
  const lineH = (size: number) => size * 0.42
  const paragraph = (text: string, size = 9, color: Rgb = INK, x = margin, width = contentW) => {
    font("normal", size, color)
    for (const l of lines(text, width)) { ensure(lineH(size) + 1); doc.text(l, x, y + lineH(size)); y += lineH(size) + 0.9 }
  }
  const tableEnd = () => {
    // @ts-expect-error lastAutoTable is added by the autotable plugin at runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 6
  }
  const table = (opts: Parameters<typeof autoTable>[1]) => {
    autoTable(doc, {
      ...PDF_TABLE_THEME,
      startY: y,
      margin: { left: margin, right: margin, top, bottom: pageH - bottom },
      rowPageBreak: "avoid",
      ...opts,
    })
    tableEnd()
  }
  const heading = (section: NumberedSection, title: string) => {
    ensure(16)
    y += 2
    font("bold", 11, ACCENT)
    doc.text(s(`${numbers[section] ?? ""}. ${title}`), margin, y + 4)
    y += 6.5
    doc.setDrawColor(LINE.r, LINE.g, LINE.b); doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += 4
  }
  const fitImage = (img: LoadedImage, x: number, yy: number, w: number, h: number) => {
    const ratio = img.w / img.h
    let dw = w, dh = w / ratio
    if (dh > h) { dh = h; dw = h * ratio }
    doc.addImage(img.dataUrl, img.format, x + (w - dw) / 2, yy + (h - dh) / 2, dw, dh)
  }
  const unavailable = (x: number, yy: number, w: number, h: number, label: string) => {
    doc.setFillColor(248, 250, 252); doc.setDrawColor(LINE.r, LINE.g, LINE.b)
    doc.rect(x, yy, w, h, "FD")
    font("normal", 8, MUTED)
    doc.text(s(label), x + w / 2, yy + h / 2, { align: "center" })
  }

  // ── letterhead (the same lines the screen prints: report-model letterhead) ──
  let logoW = 0
  if (logo) {
    const maxH = 16, maxW = 40, ratio = logo.w / logo.h
    let h = maxH, w = h * ratio
    if (w > maxW) { w = maxW; h = w / ratio }
    doc.addImage(logo.dataUrl, "PNG", margin, margin, w, h)
    logoW = w + 4
  }
  font("bold", 15)
  doc.text(s(head.name), margin + logoW, margin + 5)
  font("normal", 8.5, MUTED)
  let ly = margin + 10
  for (const l of head.lines) {
    doc.text(s(l), margin + logoW, ly); ly += 4
  }
  font("bold", 20, ACCENT)
  doc.text(s(t("tasks.report.documentTitle").toLocaleUpperCase(locale)), pageW - margin, margin + 6, { align: "right" })
  font("normal", 9)
  doc.text(s(r.header.reference), pageW - margin, margin + 12, { align: "right" })
  font("normal", 8.5, MUTED)
  doc.text(s(t("tasks.report.issued", { date: when(r.meta.generatedAt) })), pageW - margin, margin + 17, { align: "right" })
  if (r.meta.copy === "client") doc.text(s(t("tasks.report.copy.client")), pageW - margin, margin + 21.5, { align: "right" })
  y = Math.max(ly, margin + 24) + 4
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b); doc.setLineWidth(0.8)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // ── title + labels ────────────────────────────────────────────────────────
  font("bold", 16)
  for (const l of lines(r.header.title, contentW)) { doc.text(l, margin, y + 5); y += 7 }
  y += 1
  const pills = reportPills(r, headOff, t).map((p) => ({
    text: p.text,
    color: p.key === "status" && p.hex ? hexToRgb(p.hex) : p.key === "priority" ? MUTED : ACCENT,
  }))
  let px = margin
  font("bold", 8)
  for (const p of pills) {
    const text = s(p.text)
    const w = doc.getTextWidth(text) + 6
    if (px + w > pageW - margin) { px = margin; y += 7 }
    doc.setDrawColor(p.color.r, p.color.g, p.color.b); doc.setLineWidth(0.3)
    doc.roundedRect(px, y, w, 5.5, 2.75, 2.75, "S")
    ink(p.color)
    doc.text(text, px + 3, y + 3.9)
    px += w + 2
  }
  y += pills.length ? 11 : 3

  // ── detail boxes (4 columns; an empty box is never printed, so rows close up) ──
  const facts = reportFacts(r, headOff, t, when)
  const colW = contentW / 4
  for (const row of factRows(facts, 4)) {
    const heights = row.map((f) => {
      font("bold", 9)
      const v = lines(f.value || "—", colW - 4).length
      font("normal", 8)
      const sub = f.sub ? lines(f.sub, colW - 4).length : 0
      return 4 + v * 4 + sub * 3.6
    })
    const rowH = Math.max(...heights) + 3
    ensure(rowH)
    row.forEach((f, c) => {
      const x = margin + c * colW
      let fy = y
      font("bold", 7, MUTED)
      doc.text(s(f.label.toLocaleUpperCase(locale)), x, fy + 2.5, { charSpace: 0.3 })
      fy += 5.5
      font("bold", 9)
      for (const l of lines(f.value || "—", colW - 4)) { doc.text(l, x, fy + 1); fy += 4 }
      if (f.sub) { font("normal", 8, MUTED); for (const l of lines(f.sub, colW - 4)) { doc.text(l, x, fy + 1); fy += 3.6 } }
    })
    y += rowH
  }
  if (facts.length) y += 2

  // ── sections ──────────────────────────────────────────────────────────────
  for (const section of input.visible) {
    switch (section) {
      case "request": {
        heading(section, t("tasks.report.sections.request"))
        paragraph(r.request.description?.trim() || t("tasks.report.request.none"), 9, r.request.description ? INK : MUTED)
        y += 3
        break
      }
      case "work": {
        const w = r.work!
        heading(section, t("tasks.report.sections.work"))
        font("bold", 9.5)
        paragraph(w.summary, 9.5)
        y += 1.5
        const steps = workSteps(w.workPerformed)
        if (steps) {
          steps.forEach((st, i) => {
            font("normal", 9)
            const ls = lines(st, contentW - 8)
            ensure(ls.length * 4.6)
            doc.text(`${i + 1}.`, margin, y + 3.8)
            for (const l of ls) { doc.text(l, margin + 7, y + 3.8); y += 4.6 }
          })
        } else if (w.workPerformed) paragraph(w.workPerformed)
        y += 1.5
        paragraph(t("tasks.report.work.completed", { who: personName(w.completedBy) || "—", when: when(w.completedAt) }), 8, MUTED)
        y += 3
        break
      }
      case "time": {
        const tm = r.time!
        heading(section, t("tasks.report.sections.time"))
        ensure(16)
        const boxW = contentW / 3
        ;(["working", "travel", "blocked"] as const).forEach((k, i) => {
          const x = margin + i * boxW
          font("bold", 8, TIME_TONE[k]); doc.text(s(t(`tasks.jobTime.${k}`)), x, y + 3)
          font("bold", 13); doc.text(s(formatReportMinutes(tm.total[k], t)), x, y + 10)
        })
        y += 15
        if (tm.byPerson?.length) {
          const max = Math.max(1, ...tm.byPerson.map((p) => p.travel + p.working + p.blocked))
          const nameW = 48, valW = 40, barW = contentW - nameW - valW - 4
          for (const p of tm.byPerson) {
            ensure(7)
            font("normal", 8.5)
            doc.text(lines(personName(p.person), nameW - 2)[0] ?? "", margin, y + 3.6)
            let bx = margin + nameW
            for (const k of ["working", "travel", "blocked"] as const) {
              const bw = (p[k] / max) * barW
              if (bw > 0) { doc.setFillColor(TIME_TONE[k].r, TIME_TONE[k].g, TIME_TONE[k].b); doc.rect(bx, y + 1.2, bw, 3, "F"); bx += bw }
            }
            font("normal", 8, MUTED)
            doc.text(s(formatReportMinutes(p.travel + p.working + p.blocked, t)), pageW - margin, y + 3.6, { align: "right" })
            y += 6
          }
          y += 2
        }
        if (tm.ownStops?.length) {
          table({
            head: [[t("tasks.report.time.stopWho"), t("tasks.report.time.stopAt"), t("tasks.report.time.stopReason"), t("tasks.report.time.stopResumed")].map(s)],
            body: tm.ownStops.map((o) => [personName(o.person), when(o.at), o.reason ?? "—", o.resumedAt ? when(o.resumedAt) : "—"].map(s)),
          })
        }
        y += 2
        break
      }
      case "photos": {
        heading(section, t("tasks.report.sections.photos"))
        const { pairs, rest } = pairPhotos(r.photos ?? [])
        const meta = (p: TaskReportPhoto) => [personName(p.by), when(p.createdAt)].filter((x) => x && x !== "—").join(" · ")
        const gap = 6
        for (const pair of pairs) {
          const w = (contentW - gap) / 2, ih = 62
          ensure(ih + 20)
          ;[pair.before, pair.after].forEach((p, i) => {
            const x = margin + i * (w + gap)
            font("bold", 7.5, p.source === "BEFORE" ? MUTED : TIME_TONE.working)
            doc.text(s(t(p.source === "BEFORE" ? "tasks.report.photos.before" : "tasks.report.photos.after").toLocaleUpperCase(locale)), x, y + 3)
            const img = photoImgs.get(p.id)
            if (img) fitImage(img, x, y + 5, w, ih)
            else unavailable(x, y + 5, w, ih, t("tasks.report.photos.unavailable"))
            let cy = y + ih + 9
            if (p.caption) { font("normal", 8.5); doc.text(lines(p.caption, w)[0] ?? "", x, cy); cy += 4 }
            font("normal", 7.5, MUTED); doc.text(s(meta(p)), x, cy)
          })
          y += ih + 20
        }
        const cols = 3, w = (contentW - gap * (cols - 1)) / cols, ih = w * 0.75
        for (let i = 0; i < rest.length; i += cols) {
          ensure(ih + 12)
          rest.slice(i, i + cols).forEach((p, c) => {
            const x = margin + c * (w + gap)
            const img = photoImgs.get(p.id)
            if (img) fitImage(img, x, y, w, ih)
            else unavailable(x, y, w, ih, t("tasks.report.photos.unavailable"))
            font("normal", 7.5, MUTED)
            const label = p.source === "STEP" && p.fieldLabel ? p.fieldLabel : p.caption ?? ""
            if (label) doc.text(lines(label, w)[0] ?? "", x, y + ih + 4)
            doc.text(lines(meta(p), w)[0] ?? "", x, y + ih + (label ? 7.5 : 4))
          })
          y += ih + 12
        }
        break
      }
      case "checklist": {
        heading(section, t("tasks.report.sections.checklist"))
        table({
          head: [["", t("tasks.report.checklist.item"), t("tasks.report.checklist.doneBy"), t("tasks.report.checklist.when")].map(s)],
          body: (r.checklist ?? []).map((c) => [
            c.isCompleted ? "x" : "",
            c.owner ? `${c.text}\n${t("tasks.report.checklist.owner", { name: personName(c.owner) })}` : c.text,
            personName(c.completedBy) || "—",
            c.completedAt ? when(c.completedAt) : "—",
          ].map(s)),
          columnStyles: { 0: { cellWidth: 8, halign: "center", fontStyle: "bold" }, 2: { cellWidth: 38 }, 3: { cellWidth: 38 } },
        })
        break
      }
      case "stepAnswers": {
        heading(section, t("tasks.report.sections.stepAnswers"))
        const tr = (k: string, fb: string) => t(k, { defaultValue: fb })
        for (const sub of r.stepAnswers ?? []) {
          ensure(14)
          font("bold", 9.5)
          doc.text(s(statusLabel(sub.statusKey, r.header.statuses)), margin, y + 4)
          font("normal", 8, MUTED)
          doc.text(s([personName(sub.submittedBy), when(sub.submittedAt)].filter(Boolean).join(" · ")), pageW - margin, y + 4, { align: "right" })
          y += 6
          table({
            body: sub.fields.map((f) => [stepFieldLabel(f, tr), answerText(f, t, locale)].map(s)),
            columnStyles: { 0: { cellWidth: 58, textColor: rgbTuple(MUTED) } },
          })
        }
        break
      }
      case "parts": {
        heading(section, t("tasks.report.sections.parts"))
        const parts = r.parts ?? []
        const money = (n: number | null | undefined) => (n == null ? "—" : formatMoneyIn(n, r.header.currency, locale))
        const head = [t("tasks.report.parts.part"), t("tasks.report.parts.number"), t("tasks.report.parts.qty")]
        if (input.showPrices) head.push(t("tasks.report.parts.unit"), t("tasks.report.parts.total"))
        const totalAll = partsTotal(parts)
        table({
          head: [head.map(s)],
          body: parts.map((p) => {
            const row = [p.notes ? `${p.name}\n${p.notes}` : p.name, p.partNumber ?? "—", String(p.quantity)]
            if (input.showPrices) row.push(money(p.unitPrice), money(p.lineTotal))
            return row.map(s)
          }),
          ...(input.showPrices && totalAll != null
            ? { foot: [[t("tasks.report.parts.sum"), "", "", "", money(totalAll)].map(s)], footStyles: { fillColor: [248, 250, 252], textColor: rgbTuple(INK), fontStyle: "bold" } }
            : {}),
          columnStyles: { 2: { halign: "right", cellWidth: 16 }, 3: { halign: "right", cellWidth: 28 }, 4: { halign: "right", cellWidth: 30 } },
        })
        break
      }
      case "route": {
        const rt = r.route!
        heading(section, t("tasks.report.sections.route"))
        const boxH = 70
        ensure(boxH + 22)
        drawRoute(doc, rt, margin, y, contentW, boxH)
        y += boxH + 4
        const facts2 = [
          [t("tasks.report.route.distance"), formatReportDistance(rt.distanceMeters, locale)],
          [t("tasks.report.route.from"), `${when(rt.startedAt)} -> ${when(rt.endedAt)}`],
          [t("tasks.report.route.arrival"), rt.arrivalDistanceMeters != null ? formatReportDistance(rt.arrivalDistanceMeters, locale) : "—"],
          [t("tasks.report.route.points"), String(rt.pointCount)],
        ]
        const cw = contentW / 4
        facts2.forEach(([label, value], i) => {
          font("bold", 7, MUTED); doc.text(s(label!.toLocaleUpperCase(locale)), margin + i * cw, y + 2.5)
          font("bold", 8.5); doc.text(lines(value!, cw - 3)[0] ?? "", margin + i * cw, y + 7)
        })
        y += 13
        break
      }
      case "history": {
        heading(section, t("tasks.report.sections.history"))
        if (r.meta.historyTruncated) paragraph(t("tasks.report.history.truncated"), 8, MUTED)
        for (const day of groupEventsByDay(r.history, tz)) {
          ensure(12)
          font("bold", 8.5)
          doc.text(s(formatDayHeading(day.day, locale)), margin, y + 4)
          y += 6.5
          for (const { event, time } of day.items) {
            const sentence = eventSentence(event, r.header.statuses, t)
            const who = personName(event.actor)
            font("normal", 8.5)
            const ls = lines(who ? `${sentence} · ${who}` : sentence, contentW - 20)
            ensure(ls.length * 4 + 1.5)
            font("normal", 8, MUTED); doc.text(time, margin, y + 3.2)
            const c = hexToRgb(eventDotHex(event, r.header.statuses))
            doc.setFillColor(c.r, c.g, c.b); doc.circle(margin + 13.5, y + 2.2, 1.1, "F")
            font("normal", 8.5)
            for (const l of ls) { doc.text(l, margin + 17, y + 3.2); y += 4 }
            y += 1
          }
          y += 2
        }
        break
      }
      case "comments":
      case "handovers": {
        heading(section, t(section === "comments" ? "tasks.report.sections.comments" : "tasks.report.sections.handovers"))
        const items = section === "comments"
          ? (r.comments ?? []).map((c) => ({ id: c.id, text: c.content, who: personName(c.author), at: c.createdAt, extra: "" }))
          : (r.handovers ?? []).map((c) => ({ id: c.id, text: c.note, who: personName(c.author), at: c.createdAt, extra: c.workedMinutes != null ? t("tasks.report.handovers.worked", { time: formatReportMinutes(c.workedMinutes, t) }) : "" }))
        for (const it of items) {
          font("normal", 9)
          const ls = lines(it.text, contentW - 4)
          ensure(Math.min(ls.length, 6) * 4.2 + 7)
          font("bold", 8.5); doc.text(s(it.who || "—"), margin, y + 3.4)
          font("normal", 8, MUTED); doc.text(s([when(it.at), it.extra].filter(Boolean).join(" · ")), pageW - margin, y + 3.4, { align: "right" })
          y += 5
          paragraph(it.text, 9, INK, margin, contentW)
          y += 3
        }
        break
      }
      case "documents": {
        heading(section, t("tasks.report.sections.documents"))
        table({
          head: [[t("tasks.report.documents.type"), t("tasks.report.documents.name"), t("tasks.report.documents.size"), t("tasks.report.documents.by")].map(s)],
          body: (r.documents ?? []).map((d) => [fileTypeBadge(d), d.fileName, formatFileSize(d.fileSize, locale), [personName(d.by), when(d.createdAt)].filter(Boolean).join(" · ")].map(s)),
          columnStyles: { 0: { cellWidth: 16, fontStyle: "bold" }, 2: { cellWidth: 20, halign: "right" }, 3: { cellWidth: 56 } },
        })
        break
      }
      case "details": {
        heading(section, t("tasks.report.sections.details"))
        table({
          body: (r.details ?? []).map((d) => [d.name, d.value || "—"].map(s)),
          columnStyles: { 0: { cellWidth: 58, textColor: rgbTuple(MUTED) } },
        })
        break
      }
      case "signatures": {
        heading(section, t("tasks.report.sections.signatures"))
        const sigs = r.signatures ?? []
        const cols = 3, gap = 6, w = (contentW - gap * (cols - 1)) / cols, ih = 24
        for (let i = 0; i < sigs.length; i += cols) {
          ensure(ih + 20)
          sigs.slice(i, i + cols).forEach((g, c) => {
            const x = margin + c * (w + gap)
            const data = g.dataUrl && safeImageUrl(g.dataUrl)
            const img: LoadedImage | null = data
              ? { dataUrl: data, w: 3, h: 1, format: data.startsWith("data:image/png") ? "PNG" : "JPEG" }
              : sigImgs.get(g) ?? null
            doc.setDrawColor(LINE.r, LINE.g, LINE.b); doc.setLineWidth(0.2)
            doc.rect(x, y, w, ih)
            if (img) {
              try {
                if (data) {
                  const p = doc.getImageProperties(data)
                  fitImage({ ...img, w: p.width, h: p.height }, x + 1, y + 1, w - 2, ih - 2)
                } else fitImage(img, x + 1, y + 1, w - 2, ih - 2)
              } catch { unavailable(x, y, w, ih, t("tasks.report.photos.unavailable")) }
            } else unavailable(x, y, w, ih, t("tasks.report.photos.unavailable"))
            let sy = y + ih + 4
            font("bold", 8.5); doc.text(lines(signatureName(g) || "—", w)[0] ?? "", x, sy); sy += 3.8
            font("normal", 7.5, MUTED)
            doc.text(lines(signatureRole(g, r, t), w)[0] ?? "", x, sy); sy += 3.4
            if (g.signedAt) doc.text(s(when(g.signedAt)), x, sy)
          })
          y += ih + 20
        }
        break
      }
    }
  }

  // ── running header (pages 2+) and footer (every page) ─────────────────────
  const pages = doc.getNumberOfPages()
  const generated = t("tasks.report.footer", { when: when(r.meta.generatedAt), who: input.generatedBy })
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) {
      font("normal", 7.5, MUTED)
      doc.text(s(r.header.issuer.name ?? ""), margin, margin + 2)
      doc.text(s(`${t("tasks.report.documentTitle")} ${r.header.reference}`), pageW - margin, margin + 2, { align: "right" })
      doc.setDrawColor(LINE.r, LINE.g, LINE.b); doc.setLineWidth(0.3)
      doc.line(margin, margin + 4, pageW - margin, margin + 4)
    }
    font("normal", 7.5, MUTED)
    doc.text(lines([r.header.issuer.name, r.header.reference, generated].filter(Boolean).join(" · "), contentW - 30)[0] ?? "", margin, pageH - 8)
    doc.text(s(t("tasks.report.page", { page: p, pages })), pageW - margin, pageH - 8, { align: "right" })
  }
  return doc
}

/** Build and save under `Client_Job-REF_YYYY-MM-DD.pdf`. */
export async function downloadJobReportPdf(input: JobReportPdfInput): Promise<void> {
  const doc = await buildJobReportPdf(input)
  doc.save(reportFileName(input.report, input.t("tasks.report.fileWord")))
}

// ─── pieces ─────────────────────────────────────────────────────────────────

/** The route as a line in a box — no tiles, nothing fetched: the shape of the drive. */
function drawRoute(doc: jsPDF, rt: NonNullable<TaskReport["route"]>, x: number, y: number, w: number, h: number) {
  doc.setFillColor(248, 250, 252); doc.setDrawColor(LINE.r, LINE.g, LINE.b); doc.setLineWidth(0.2)
  doc.rect(x, y, w, h, "FD")
  const path = routePath(rt)
  if (path.length < 2) return
  const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const spanX = Math.max((maxLng - minLng) * Math.cos(midLat), 1e-6), spanY = Math.max(maxLat - minLat, 1e-6)
  const pad = 6
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  const ox = x + (w - spanX * scale) / 2, oy = y + (h - spanY * scale) / 2
  const pt = ([lat, lng]: [number, number]) => [ox + (lng - minLng) * Math.cos(midLat) * scale, oy + (maxLat - lat) * scale] as const
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b); doc.setLineWidth(0.9)
  doc.setLineCap("round"); doc.setLineJoin("round")
  for (let i = 1; i < path.length; i++) {
    const a = pt(path[i - 1]!), b = pt(path[i]!)
    doc.line(a[0], a[1], b[0], b[1])
  }
  const start = pt(path[0]!), end = pt(path[path.length - 1]!)
  doc.setFillColor(34, 197, 94); doc.circle(start[0], start[1], 1.6, "F")
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b); doc.circle(end[0], end[1], 1.6, "F")
}

