import jsPDF from "jspdf"
import type { TaskReport, TaskReportSignature } from "@hbcfield/shared/client"

import { loadImage, loadLogo, type LoadedImage } from "@/lib/pdf-common"
import { mapWithLimit } from "@/lib/pdf-text"

import { createCursor, type PdfCursor } from "./pdf-cursor"
import type { ReportCtx } from "./pdf-context"
import { drawFacts, drawLetterhead, drawPageFrames, drawTitleAndPills } from "./pdf-head"
import { drawChecklist, drawHistory, drawParts, drawRouteSection, drawStepAnswers } from "./pdf-sections-records"
import { drawDetails, drawDocuments, drawNotes, drawSignatures } from "./pdf-sections-notes"
import { drawPhotos, drawRequest, drawTime, drawWork } from "./pdf-sections-work"
import {
  formatReportDateTime,
  letterhead,
  reportFileName,
  safeImageUrl,
  sectionNumbers,
  type HeadToggle,
  type NumberedSection,
  type Translate,
} from "./report-model"

/**
 * The job report as a PDF, built on the device — the same family as the
 * invoice (palette, letterhead, table header, file naming).
 *
 * ⚠️ LOADED THROUGH `import()` ONLY. jsPDF and autotable are a few hundred KB;
 * the report page imports this file when "Download PDF" is pressed and never
 * before, so opening a report costs no PDF engine. The `pdf-*` files beside it
 * are reached only from here, so they load with it.
 *
 * It prints exactly the copy it was given and the sections the screen shows:
 * the caller passes the visible list, this draws it. Nothing here decides what
 * a client may read — the server already cut the client copy.
 *
 * ⚠️ NEVER SPLIT a photo pair, a table row or a signature block across a page:
 * each block asks for its full height first (`ensure`), and tables avoid
 * breaking rows.
 *
 * The drawing order is pinned call by call in `job-report-pdf.pin.spec.ts`.
 */

interface JobReportPdfInput {
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

const PHOTO_OPTS = { format: "JPEG" as const, maxEdge: 1200, quality: 0.82, timeoutMs: 15000 }

/** Images first, with progress — the only slow part. */
async function loadReportImages(input: JobReportPdfInput, visible: Set<NumberedSection>) {
  const r = input.report
  const photos = visible.has("photos") ? (r.photos ?? []) : []
  const stepSigs = visible.has("signatures") ? (r.signatures ?? []).filter((g) => g.kind === "STEP" && g.url) : []
  const total = photos.length + stepSigs.length
  let done = 0
  input.onProgress?.(0, total)
  const tick = () => {
    done += 1
    input.onProgress?.(done, total)
  }
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
  return { photoImgs, sigImgs }
}

function drawSection(c: PdfCursor, ctx: ReportCtx, section: NumberedSection) {
  switch (section) {
    case "request":
      return drawRequest(c, ctx)
    case "work":
      return drawWork(c, ctx)
    case "time":
      return drawTime(c, ctx)
    case "photos":
      return drawPhotos(c, ctx)
    case "checklist":
      return drawChecklist(c, ctx)
    case "stepAnswers":
      return drawStepAnswers(c, ctx)
    case "parts":
      return drawParts(c, ctx)
    case "route":
      return drawRouteSection(c, ctx)
    case "history":
      return drawHistory(c, ctx)
    case "comments":
    case "handovers":
      return drawNotes(c, ctx, section)
    case "documents":
      return drawDocuments(c, ctx)
    case "details":
      return drawDetails(c, ctx)
    case "signatures":
      return drawSignatures(c, ctx)
  }
}

export async function buildJobReportPdf(input: JobReportPdfInput): Promise<jsPDF> {
  const { report: r, t, locale } = input
  const tz = r.header.workspace?.timezone ?? null
  const visible = new Set(input.visible)
  const headOff = input.headOff ?? new Set<HeadToggle>()
  const head = letterhead(r.header.issuer, headOff, t)

  const { photoImgs, sigImgs } = await loadReportImages(input, visible)
  const logo = head.logoUrl ? await loadLogo(head.logoUrl) : null

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const c = createCursor(doc)
  const ctx: ReportCtx = {
    r,
    t,
    locale,
    tz,
    when: (iso) => formatReportDateTime(iso, tz, locale),
    numbers: sectionNumbers(input.visible),
    showPrices: input.showPrices,
    photoImgs,
    sigImgs,
  }

  drawLetterhead(c, ctx, head, logo)
  drawTitleAndPills(c, ctx, headOff)
  drawFacts(c, ctx, headOff)
  for (const section of input.visible) drawSection(c, ctx, section)
  drawPageFrames(c, ctx, input.generatedBy)
  return doc
}

/** Build and save under `Client_Job-REF_YYYY-MM-DD.pdf`. */
export async function downloadJobReportPdf(input: JobReportPdfInput): Promise<void> {
  const doc = await buildJobReportPdf(input)
  doc.save(reportFileName(input.report, input.t("tasks.report.fileWord")))
}
