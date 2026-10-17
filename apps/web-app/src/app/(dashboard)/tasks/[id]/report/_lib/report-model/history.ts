/**
 * Photos, the history by day, events as sentences, files, signatures, answers and the route (moved
 * here unchanged)
 */
import {
  personName,
  type TaskReport,
  type TaskReportEvent,
  type TaskReportPhoto,
  type TaskReportRoute,
  type TaskReportSignature,
  type TaskReportStatus,
  type TaskReportStepAnswer,
  utcToZonedInput,
} from '@hbcfield/shared/client';
import { EXCLUDED_EVENTS, getEventConfig, getEventDescription } from '../../../_components/activity-events';
import { dayKeyOf, fileNamePart, pdfFileName } from '@/lib/pdf-filename';
import { statusHex, statusLabel, zonedDayKey } from './facts';
import type { Translate } from './toggles';

// ─── photos ─────────────────────────────────────────────────────────────────

interface PhotoPair {
  before: TaskReportPhoto
  after: TaskReportPhoto
}

/**
 * Before/after pairs side by side, the rest as a grid. Paired in the order they
 * were taken (the first BEFORE with the first AFTER); an unmatched one joins
 * the grid, so no photo is ever dropped.
 */
export function pairPhotos(photos: readonly TaskReportPhoto[]): { pairs: PhotoPair[]; rest: TaskReportPhoto[] } {
  const before = photos.filter((p) => p.source === "BEFORE")
  const after = photos.filter((p) => p.source === "AFTER")
  const n = Math.min(before.length, after.length)
  const pairs: PhotoPair[] = []
  for (let i = 0; i < n; i++) pairs.push({ before: before[i]!, after: after[i]! })
  const paired = new Set(pairs.flatMap((p) => [p.before.id, p.after.id]))
  return { pairs, rest: photos.filter((p) => !paired.has(p.id)) }
}

// ─── the history ────────────────────────────────────────────────────────────

interface HistoryDay {
  day: string
  items: Array<{ event: TaskReportEvent; time: string }>
}

/**
 * The history grouped by day IN THE WORKSPACE'S ZONE, oldest first. Leaves out
 * what the task page's Activity leaves out (a comment is its own section).
 */
export function groupEventsByDay(events: readonly TaskReportEvent[], tz: string | null | undefined): HistoryDay[] {
  const days: HistoryDay[] = []
  const shown = events.filter((e) => !EXCLUDED_EVENTS.includes(e.type))
  for (const e of [...shown].sort((a, b) => a.at.localeCompare(b.at))) {
    const wall = utcToZonedInput(e.at, tz ?? null)
    if (!wall) continue
    const day = wall.slice(0, 10)
    const last = days[days.length - 1]
    const item = { event: e, time: wall.slice(11, 16) }
    if (last && last.day === day) last.items.push(item)
    else days.push({ day, items: [item] })
  }
  return days
}

/** The colour behind each activity tone (the task page's EVENT_CONFIG), for a dot on paper. */
const TONE_HEX: Record<string, string> = {
  "text-blue-500": "#3b82f6",
  "text-muted-foreground": "#94a3b8",
  "text-purple-500": "#a855f7",
  "text-orange-500": "#f97316",
  "text-amber-500": "#f59e0b",
  "text-cyan-500": "#06b6d4",
  "text-teal-500": "#14b8a6",
  "text-red-500": "#ef4444",
  "text-green-500": "#22c55e",
  "text-indigo-500": "#6366f1",
  "text-primary": "#2563eb",
  "text-violet-500": "#8b5cf6",
}

export function eventDotHex(e: TaskReportEvent, statuses: readonly TaskReportStatus[]): string {
  if (e.type === "STATUS_CHANGED" && typeof e.data.newStatus === "string") return statusHex(e.data.newStatus, statuses)
  return TONE_HEX[getEventConfig(e.type).color] ?? "#94a3b8"
}

/**
 * One event as a sentence — the task page's own wording (activity-events.ts),
 * with the flow's step names and the people the event names filled in.
 */
export function eventSentence(e: TaskReportEvent, statuses: readonly TaskReportStatus[], t: Translate): string {
  const data: Record<string, unknown> = { ...e.data }
  if (e.type === "STATUS_CHANGED") {
    const from = typeof data.oldStatus === "string" ? statusLabel(data.oldStatus, statuses) : null
    const to = typeof data.newStatus === "string" ? statusLabel(data.newStatus, statuses) : null
    if (from && to) {
      let s = `${from} → ${to}`
      if (data.byOffice) s += ` · ${t("tasks.activity.byOffice")}${data.officeReason ? ` · “${String(data.officeReason)}”` : ""}`
      else if (data.newStatus === "BLOCKED" && data.reason) s += `: ${String(data.reason)}`
      return s
    }
    if (to) return t("tasks.report.history.movedTo", { step: to })
  }
  if (e.type === "ASSIGNED" && !data.workerName && e.refs.workerId) data.workerName = personName(e.refs.workerId)
  if (e.type === "ASSIGNEE_ADDED" && e.refs.assigneeId) return t("tasks.activity.assignedTo", { name: personName(e.refs.assigneeId) })
  if (e.type === "LEAD_CHANGED" && !data.toName && e.refs.to) data.toName = personName(e.refs.to)
  if (e.type === "CREATED") {
    if (data.source === "recurring_template") return t("tasks.report.history.createdRecurring")
  }
  if (e.type === "UNASSIGNED" && e.refs.previousWorkerId) {
    return `${t("tasks.activity.events.UNASSIGNED")} · ${personName(e.refs.previousWorkerId)}`
  }
  return getEventDescription({ eventType: e.type, metadata: data }, t)
}

// ─── the file ───────────────────────────────────────────────────────────────

/**
 * `Client_Job-REF_YYYY-MM-DD.pdf` — the client first so a folder groups by who
 * it is for; the day the job finished (or the report was made) in the
 * workspace's zone.
 */
export function reportFileName(r: TaskReport, jobWord: string): string {
  const ref = r.header.reference.replace(/^#/, "")
  const day = zonedDayKey(r.header.finishedAt ?? r.meta.generatedAt, r.header.workspace?.timezone) ?? dayKeyOf(r.meta.generatedAt)
  return pdfFileName([fileNamePart(r.header.client?.name), fileNamePart(`${jobWord}-${ref}`), day], "job-report")
}

export function partsTotal(parts: NonNullable<TaskReport["parts"]>): number | null {
  const priced = parts.filter((p) => p.lineTotal != null)
  if (!priced.length) return null
  return Math.round(priced.reduce((s, p) => s + (p.lineTotal ?? 0), 0) * 100) / 100
}

/** "PDF", "DOCX", "JPG" — the badge on a document card. */
export function fileTypeBadge(f: { fileName: string; mimeType: string | null }): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(f.fileName)?.[1]
  if (ext) return ext.toUpperCase()
  const sub = f.mimeType?.split("/")[1]
  return sub ? sub.split(/[.+-]/)[0]!.toUpperCase().slice(0, 5) : "FILE"
}

// ─── shared by the sheet and the PDF ────────────────────────────────────────

export function signatureName(g: TaskReportSignature): string {
  return g.name ?? personName(g.person)
}

/** "Technician", "Customer · BILLA AG", or the step field that asked for it. */
export function signatureRole(g: TaskReportSignature, r: TaskReport, t: Translate): string {
  if (g.kind === "TECHNICIAN") return t("tasks.report.signatures.technician")
  if (g.kind === "CUSTOMER") return [t("tasks.report.signatures.customer"), r.header.client?.name].filter(Boolean).join(" · ")
  return [g.fieldLabel, statusLabel(g.statusKey, r.header.statuses)].filter(Boolean).join(" · ")
}

/** A step answer as plain text (photos and signatures point at their own sections). */
export function answerText(f: TaskReportStepAnswer, t: Translate, locale: string): string {
  const v = f.value
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return t("stepForm.report.notAnswered", { defaultValue: "Not answered" })
  switch (f.type) {
    case "yesno": return v === true ? t("stepForm.dialog.yes", { defaultValue: "Yes" }) : t("stepForm.dialog.no", { defaultValue: "No" })
    case "number": return typeof v === "number" ? v.toLocaleString(locale) : String(v)
    case "date": {
      const d = typeof v === "string" ? new Date(`${v}T12:00:00`) : null
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(locale, { dateStyle: "medium" }) : String(v)
    }
    case "photos": return t("tasks.report.answers.photos", { count: f.files.length })
    case "signature": return t("tasks.report.answers.signed")
    default: return Array.isArray(v) ? v.join(", ") : String(v)
  }
}

/** The road-snapped path when the tracker had one, else the recorded points. */
export function routePath(rt: TaskReportRoute): Array<[number, number]> {
  const m = rt.matchedPath
  if (Array.isArray(m) && m.length > 1 && m.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
    return (m as Array<[number, number]>).map((p) => [p[0], p[1]])
  }
  return rt.points.map((p) => [p.lat, p.lng])
}
