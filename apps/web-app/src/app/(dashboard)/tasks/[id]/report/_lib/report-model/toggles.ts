/** Which sections and lines are shown, and what is remembered per workspace (moved here unchanged) */
import type {
  ClientCopyOption,
  TaskReport,
  TaskReportCopy,
  TaskReportIssuerOption,
  TaskReportSection,
} from '@hbcfield/shared/client';
import { EXCLUDED_EVENTS } from '../../../_components/activity-events';
import { keys } from '@/lib/query-keys';

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

export { HEAD_TOGGLE_GROUPS }
export type { FactKey, PillKey }
