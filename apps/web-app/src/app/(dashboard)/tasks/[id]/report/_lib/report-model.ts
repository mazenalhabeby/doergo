import {
  utcToZonedInput,
  type ClientCopyOption,
  type TaskReport,
  type TaskReportCopy,
  type TaskReportEvent,
  type TaskReportIssuer,
  type TaskReportIssuerOption,
  type TaskReportPhoto,
  type TaskReportRoute,
  type TaskReportSignature,
  type TaskReportStepAnswer,
  type TaskReportSection,
  type TaskReportStatus,
  formatDistance,
  personName,
} from "@hbcfield/shared/client"

import { dayKeyOf, fileNamePart, pdfFileName } from "@/lib/pdf-filename"
import { getStatusConfig } from "@/lib/constants"
import { keys } from "@/lib/query-keys"
import { EXCLUDED_EVENTS, getEventConfig, getEventDescription } from "../../_components/activity-events"

/**
 * The job report as the screen and the PDF both read it — pure, so the two can
 * never disagree about what is printed, in which order, under which number.
 *
 * The bundle (shared tasks/task-report.ts) says what EXISTS; this decides what
 * is SHOWN: the sections the person left switched on, and only those with
 * something in them.
 */

export type Translate = (key: string, options?: Record<string, unknown>) => string

// ─── what can be switched on and off ────────────────────────────────────────

/**
 * The rail's switches, in rail order. One switch may stand for two sections
 * (comments + handover notes), and part prices is a switch on a column, not a
 * section.
 */
const REPORT_TOGGLES = [
  "time",
  "photos",
  "checklist",
  "stepAnswers",
  "parts",
  "partPrices",
  "route",
  "history",
  "notes",
  "documents",
  "details",
  "signatures",
] as const
export type ReportToggle = (typeof REPORT_TOGGLES)[number]

/** The numbered sections of the document, in print order (the header is not numbered). */
const NUMBERED_SECTIONS = [
  "request",
  "work",
  "time",
  "photos",
  "checklist",
  "stepAnswers",
  "parts",
  "route",
  "history",
  "comments",
  "handovers",
  "documents",
  "details",
  "signatures",
] as const satisfies readonly TaskReportSection[]
export type NumberedSection = (typeof NUMBERED_SECTIONS)[number]

/** The switch that governs a section; request and work are always printed. */
const SECTION_TOGGLE: Partial<Record<NumberedSection, ReportToggle>> = {
  time: "time",
  photos: "photos",
  checklist: "checklist",
  stepAnswers: "stepAnswers",
  parts: "parts",
  route: "route",
  history: "history",
  comments: "notes",
  handovers: "notes",
  documents: "documents",
  details: "details",
  signatures: "signatures",
}

/** Does the bundle carry part prices (the office copy, or a client copy with them added back)? */
function hasPartPrices(r: TaskReport): boolean {
  return (r.parts ?? []).some((p) => p.unitPrice != null || p.lineTotal != null)
}

/** Does a section have anything to print? A present-but-empty list is not worth a heading. */
function sectionHasContent(r: TaskReport, s: NumberedSection): boolean {
  if (s !== "request" && !r.meta.sections.includes(s)) return false
  switch (s) {
    case "request":
      return true
    case "work":
      return !!r.work
    case "time":
      return !!r.time && r.time.total.travel + r.time.total.working + r.time.total.blocked > 0
    case "route":
      return !!r.route && r.route.pointCount > 0
    case "history":
      return r.history.some((e) => !EXCLUDED_EVENTS.includes(e.type))
    default: {
      const v = r[s]
      return Array.isArray(v) && v.length > 0
    }
  }
}

/** The switches this report offers — only for what it actually has. */
export function availableToggles(r: TaskReport): ReportToggle[] {
  return REPORT_TOGGLES.filter((tg) => {
    if (tg === "partPrices") return sectionHasContent(r, "parts") && hasPartPrices(r)
    if (tg === "notes") return sectionHasContent(r, "comments") || sectionHasContent(r, "handovers")
    return sectionHasContent(r, tg as NumberedSection)
  })
}

/** The sections printed, in order, given the switches turned OFF. */
export function visibleSections(r: TaskReport, off: ReadonlySet<ReportToggle>): NumberedSection[] {
  return NUMBERED_SECTIONS.filter((s) => {
    if (!sectionHasContent(r, s)) return false
    const tg = SECTION_TOGGLE[s]
    return !tg || !off.has(tg)
  })
}

/** "1", "2", … recomputed from what is shown, so switching one off never leaves a gap. */
export function sectionNumbers(visible: readonly NumberedSection[]): Partial<Record<NumberedSection, number>> {
  const out: Partial<Record<NumberedSection, number>> = {}
  visible.forEach((s, i) => { out[s] = i + 1 })
  return out
}

/** Prices are printed only when the bundle has them and their switch is on. */
export function showPrices(r: TaskReport, off: ReadonlySet<ReportToggle>): boolean {
  return hasPartPrices(r) && !off.has("partPrices")
}

// ─── remembered per workspace ───────────────────────────────────────────────

const STORE_PREFIX = "hbc.jobReport"

function read<T>(key: string, parse: (v: unknown) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? parse(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window, blocked storage */ }
}

const onlyKnown = <T extends string>(known: readonly T[]) => (v: unknown): T[] | null =>
  Array.isArray(v) ? v.filter((x): x is T => typeof x === "string" && (known as readonly string[]).includes(x)) : null

/** The switches turned OFF in this workspace (a new section is therefore on by default). */
export function loadOffToggles(spaceId: string | null | undefined): Set<ReportToggle> {
  return new Set(read(`${STORE_PREFIX}.off.${spaceId ?? "none"}`, onlyKnown(REPORT_TOGGLES)) ?? [])
}
export function saveOffToggles(spaceId: string | null | undefined, off: ReadonlySet<ReportToggle>): void {
  write(`${STORE_PREFIX}.off.${spaceId ?? "none"}`, [...off])
}

/** What the office chose to add back to the client copy in this workspace. */
export function loadClientInclude(spaceId: string | null | undefined, known: readonly ClientCopyOption[]): ClientCopyOption[] {
  return normalizeInclude(read(`${STORE_PREFIX}.include.${spaceId ?? "none"}`, onlyKnown(known)) ?? [])
}
export function saveClientInclude(spaceId: string | null | undefined, include: readonly ClientCopyOption[]): void {
  write(`${STORE_PREFIX}.include.${spaceId ?? "none"}`, normalizeInclude(include))
}

/** Sorted and unique — the query key and the URL must not depend on click order. */
export function normalizeInclude(include: readonly ClientCopyOption[]): ClientCopyOption[] {
  return [...new Set(include)].sort()
}

/**
 * The query key of one report: the office copy ignores `include`, so it is not
 * part of its key; the issuer is part of both (it changes the letterhead).
 */
export function reportQueryKey(taskId: string, copy: TaskReportCopy, include: readonly ClientCopyOption[], issuer: string | null = null) {
  return copy === "client"
    ? keys.taskExtras.fullReport(taskId, copy, normalizeInclude(include).join(","), issuer ?? "")
    : keys.taskExtras.fullReport(taskId, copy, issuer ?? "")
}

/** The "Issued by" choice remembered for this workspace — only while it is still one of the choices. */
export function loadIssuerChoice(spaceId: string | null | undefined, issuers: readonly TaskReportIssuerOption[] | undefined): string | null {
  const id = read(`${STORE_PREFIX}.issuer.${spaceId ?? "none"}`, (v) => (typeof v === "string" ? v : null))
  return id && (issuers ?? []).some((i) => i.id === id) ? id : null
}
export function saveIssuerChoice(spaceId: string | null | undefined, issuer: string | null): void {
  if (issuer) write(`${STORE_PREFIX}.issuer.${spaceId ?? "none"}`, issuer)
  else {
    try { window.localStorage.removeItem(`${STORE_PREFIX}.issuer.${spaceId ?? "none"}`) } catch { /* blocked storage */ }
  }
}

// ─── the top of the report: letterhead, labels, detail boxes ────────────────

/**
 * Display switches on what the reader already has — nothing here changes what
 * the server sent. The company NAME always prints.
 */
const HEAD_TOGGLE_GROUPS = {
  letterhead: ["logo", "address", "contact", "registration"],
  labels: ["status", "priority", "taskType", "origin"],
  facts: ["client", "site", "equipment", "workspace", "due", "started", "finished", "worked"],
} as const
export type HeadToggleGroup = keyof typeof HEAD_TOGGLE_GROUPS
export type HeadToggle = (typeof HEAD_TOGGLE_GROUPS)[HeadToggleGroup][number]
type FactKey = (typeof HEAD_TOGGLE_GROUPS)["facts"][number]
type PillKey = (typeof HEAD_TOGGLE_GROUPS)["labels"][number]
export const HEAD_TOGGLES: readonly HeadToggle[] = [
  ...HEAD_TOGGLE_GROUPS.letterhead, ...HEAD_TOGGLE_GROUPS.labels, ...HEAD_TOGGLE_GROUPS.facts,
]

/** The top-of-report switches turned OFF in this workspace (all on by default). */
export function loadHeadOff(spaceId: string | null | undefined): Set<HeadToggle> {
  return new Set(read(`${STORE_PREFIX}.headOff.${spaceId ?? "none"}`, onlyKnown(HEAD_TOGGLES)) ?? [])
}
export function saveHeadOff(spaceId: string | null | undefined, off: ReadonlySet<HeadToggle>): void {
  write(`${STORE_PREFIX}.headOff.${spaceId ?? "none"}`, [...off])
}

/** The letterhead as printed: the name always; each other line only when it exists and is switched on. */
export function letterhead(issuer: TaskReportIssuer, off: ReadonlySet<HeadToggle>, t: Translate) {
  const contact = [issuer.phone, issuer.email, issuer.website].filter(Boolean).join("  •  ")
  const ids = [
    issuer.vatId && `${t("tasks.report.vatId")}: ${issuer.vatId}`,
    issuer.taxId && `${t("tasks.report.taxId")}: ${issuer.taxId}`,
    issuer.registerNumber && `${t("tasks.report.register")}: ${issuer.registerNumber}`,
  ].filter((x): x is string => !!x)
  return {
    name: issuer.name || t("tasks.report.companyFallback"),
    logoUrl: off.has("logo") ? null : safeImageUrl(issuer.logoUrl),
    lines: [
      ...(off.has("address") ? [] : issuer.addressLines.filter(Boolean)),
      ...(off.has("contact") || !contact ? [] : [contact]),
      ...(off.has("registration") ? [] : ids),
    ],
  }
}

interface ReportPill { key: PillKey; text: string; /** status only: the flow's colour */ hex: string | null }

/** The labels under the title, in order — each only when it has words and is switched on. */
export function reportPills(r: TaskReport, off: ReadonlySet<HeadToggle>, t: Translate): ReportPill[] {
  const h = r.header
  const all: ReportPill[] = [
    { key: "status", text: statusLabel(h.status, h.statuses), hex: statusHex(h.status, h.statuses) },
    { key: "priority", text: h.priority ? t(`tasks.priority.${h.priority}`) : "", hex: null },
    { key: "taskType", text: h.taskType ?? "", hex: null },
    { key: "origin", text: originLabel(r, t) ?? "", hex: null },
  ]
  return all.filter((p) => p.text && !off.has(p.key))
}

interface ReportFact { key: FactKey; label: string; value: string; sub: string | null }

/**
 * The detail boxes, in grid order. A box with nothing to say is not printed,
 * whatever its switch — and "Worked time" with a counted total of 0 says
 * nothing a client should read ("0 min" on a finished job reads as wrong).
 */
export function reportFacts(r: TaskReport, off: ReadonlySet<HeadToggle>, t: Translate, when: (iso: string | null | undefined) => string): ReportFact[] {
  const h = r.header
  const all: Array<ReportFact | null> = [
    h.client ? { key: "client", label: t("tasks.report.facts.client"), value: h.client.name, sub: h.contact?.name ? [h.contact.name, h.contact.phone].filter(Boolean).join(" · ") : null } : null,
    h.site.address || h.unit ? { key: "site", label: t("tasks.report.facts.site"), value: h.unit?.name ?? h.site.address ?? "", sub: h.unit ? (h.unit.address ?? h.site.address ?? null) : null } : null,
    h.asset ? { key: "equipment", label: t("tasks.report.facts.equipment"), value: h.asset.name, sub: h.asset.serialNumber ? t("tasks.report.facts.serial", { serial: h.asset.serialNumber }) : null } : null,
    h.workspace ? { key: "workspace", label: t("tasks.report.facts.workspace"), value: h.workspace.name, sub: null } : null,
    h.dueDate ? { key: "due", label: t("tasks.report.facts.due"), value: when(h.dueDate), sub: null } : null,
    h.startedAt ? { key: "started", label: t("tasks.report.facts.started"), value: when(h.startedAt), sub: personName(h.startedBy) || null } : null,
    h.finishedAt ? { key: "finished", label: t("tasks.report.facts.finished"), value: when(h.finishedAt), sub: null } : null,
    h.totalMinutes > 0 ? { key: "worked", label: t("tasks.report.facts.worked"), value: formatReportMinutes(h.totalMinutes, t), sub: null } : null,
  ]
  return all.filter((f): f is ReportFact => !!f && !off.has(f.key))
}

/** Rows of a grid of `cols` boxes — the PDF lays out the same boxes the screen's grid flows. */
export function factRows<T>(facts: readonly T[], cols = 4): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < facts.length; i += cols) rows.push(facts.slice(i, i + cols))
  return rows
}

/** The top-of-report switches this report offers — only for what it actually has. */
export function availableHeadToggles(r: TaskReport, t: Translate): Record<HeadToggleGroup, HeadToggle[]> {
  const none = new Set<HeadToggle>()
  const i = r.header.issuer
  const has: Record<string, boolean> = {
    logo: !!safeImageUrl(i.logoUrl),
    address: i.addressLines.some(Boolean),
    contact: [i.phone, i.email, i.website].some(Boolean),
    registration: [i.vatId, i.taxId, i.registerNumber].some(Boolean),
  }
  for (const p of reportPills(r, none, t)) has[p.key] = true
  for (const f of reportFacts(r, none, t, () => "x")) has[f.key] = true
  return {
    letterhead: HEAD_TOGGLE_GROUPS.letterhead.filter((k) => has[k]),
    labels: HEAD_TOGGLE_GROUPS.labels.filter((k) => has[k]),
    facts: HEAD_TOGGLE_GROUPS.facts.filter((k) => has[k]),
  }
}

// ─── words and numbers ──────────────────────────────────────────────────────

/** Minutes as people read a timesheet: "9 h 34 min", "45 min", "3 h". */
export function formatReportMinutes(minutes: number | null | undefined, t: Translate): string {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return t("tasks.report.units.minutes", { m })
  if (m === 0) return t("tasks.report.units.hours", { h })
  return t("tasks.report.units.hoursMinutes", { h, m })
}

/** Metres as "850 m" / "12.4 km" — THE distance formatter (shared), bound to the report's language. */
export function formatReportDistance(meters: number | null | undefined, locale: string): string {
  return formatDistance(meters, { locale })
}

/** An instant in the workspace's zone: "9 Oct 2026, 14:05". */
export function formatReportDateTime(iso: string | null | undefined, tz: string | null | undefined, locale: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  try {
    return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", ...(tz ? { timeZone: tz } : {}) })
  } catch {
    return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
  }
}

/** A day key in the workspace's zone ("2026-10-09"). */
function zonedDayKey(iso: string | null | undefined, tz: string | null | undefined): string | null {
  const wall = utcToZonedInput(iso ?? null, tz ?? null)
  return wall ? wall.slice(0, 10) : null
}

/** A day heading: "Thursday, 9 October 2026". */
export function formatDayHeading(dayKey: string, locale: string): string {
  const d = new Date(`${dayKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dayKey
  return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

/**
 * The service report's "work performed", as steps when it was written as steps
 * ("1. …", "- …" or simply one per line) — otherwise null, and it prints as a paragraph.
 */
export function workSteps(text: string | null | undefined): string[] | null {
  if (!text) return null
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(?:\d{1,3}[.)]|[-*•])\s+/, "").trim())
    .filter(Boolean)
  return lines.length >= 2 ? lines : null
}

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

/**
 * An image link the page may draw: a signed http(s) link from the response or a
 * PNG/JPEG data URL. Anything else (javascript:, an SVG data URL) is not drawn.
 */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) return url
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

export function isImageFile(f: { mimeType: string | null; fileName: string }): boolean {
  return (f.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(f.fileName)
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

/** A step's name from the job's own flow, else the built-in label. */
export function statusLabel(key: string | null | undefined, statuses: readonly TaskReportStatus[]): string {
  if (!key) return ""
  return statuses.find((s) => s.key === key)?.name ?? getStatusConfig(key).label ?? key.replace(/_/g, " ")
}

/** A step's colour from the job's own flow, else the built-in one. */
function statusHex(key: string, statuses: readonly TaskReportStatus[]): string {
  return statuses.find((s) => s.key === key)?.color || getStatusConfig(key).hex
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

/** "Created from a client request #REF", from a recurring template, as a subtask of … */
function originLabel(r: TaskReport, t: Translate): string | null {
  const o = r.request.origin
  switch (o.kind) {
    case "CUSTOMER_PORTAL":
      return t("tasks.report.origin.portal", { ref: o.portalReference ?? r.header.reference })
    case "RECURRING":
      return o.recurringTemplate?.title ? t("tasks.report.origin.recurringNamed", { name: o.recurringTemplate.title }) : t("tasks.report.origin.recurring")
    case "SUBTASK":
      return o.parent ? t("tasks.report.origin.subtask", { title: o.parent.title }) : null
    default:
      return null
  }
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
