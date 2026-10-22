/** The letterhead, the facts and pills at the top, and how times, distances and days are written. */
import {
  formatDistance,
  personName,
  type TaskReport,
  type TaskReportIssuer,
  type TaskReportStatus,
  utcToZonedInput,
} from "@hbcfield/shared/client"
import { getStatusConfig } from "@/lib/constants"
import {
  HEAD_TOGGLE_GROUPS,
  type FactKey,
  type HeadToggle,
  type HeadToggleGroup,
  type PillKey,
  type Translate,
} from "./toggles"

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

interface ReportPill {
  key: PillKey
  text: string
  /** status only: the flow's colour */ hex: string | null
}

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

interface ReportFact {
  key: FactKey
  label: string
  value: string
  sub: string | null
}

/**
 * The detail boxes, in grid order. A box with nothing to say is not printed,
 * whatever its switch — and "Worked time" with a counted total of 0 says
 * nothing a client should read ("0 min" on a finished job reads as wrong).
 */
export function reportFacts(
  r: TaskReport,
  off: ReadonlySet<HeadToggle>,
  t: Translate,
  when: (iso: string | null | undefined) => string,
): ReportFact[] {
  const h = r.header
  const all: Array<ReportFact | null> = [
    h.client
      ? {
          key: "client",
          label: t("tasks.report.facts.client"),
          value: h.client.name,
          sub: h.contact?.name ? [h.contact.name, h.contact.phone].filter(Boolean).join(" · ") : null,
        }
      : null,
    h.site.address || h.unit
      ? {
          key: "site",
          label: t("tasks.report.facts.site"),
          value: h.unit?.name ?? h.site.address ?? "",
          sub: h.unit ? (h.unit.address ?? h.site.address ?? null) : null,
        }
      : null,
    h.asset
      ? {
          key: "equipment",
          label: t("tasks.report.facts.equipment"),
          value: h.asset.name,
          sub: h.asset.serialNumber ? t("tasks.report.facts.serial", { serial: h.asset.serialNumber }) : null,
        }
      : null,
    h.workspace
      ? { key: "workspace", label: t("tasks.report.facts.workspace"), value: h.workspace.name, sub: null }
      : null,
    h.dueDate ? { key: "due", label: t("tasks.report.facts.due"), value: when(h.dueDate), sub: null } : null,
    h.startedAt
      ? {
          key: "started",
          label: t("tasks.report.facts.started"),
          value: when(h.startedAt),
          sub: personName(h.startedBy) || null,
        }
      : null,
    h.finishedAt
      ? { key: "finished", label: t("tasks.report.facts.finished"), value: when(h.finishedAt), sub: null }
      : null,
    h.totalMinutes > 0
      ? {
          key: "worked",
          label: t("tasks.report.facts.worked"),
          value: formatReportMinutes(h.totalMinutes, t),
          sub: null,
        }
      : null,
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
export function formatReportDateTime(
  iso: string | null | undefined,
  tz: string | null | undefined,
  locale: string,
): string {
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
  return d.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * The service report's "work performed", as steps when it was written as steps
 * ("1. …", "- …" or simply one per line) — otherwise null, and it prints as a paragraph.
 */
export function workSteps(text: string | null | undefined): string[] | null {
  if (!text) return null
  const lines = text
    .split(/\r?\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^(?:\d{1,3}[.)]|[-*•])\s+/, "")
        .trim(),
    )
    .filter(Boolean)
  return lines.length >= 2 ? lines : null
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

/** A step's name from the job's own flow, else the built-in label. */
export function statusLabel(key: string | null | undefined, statuses: readonly TaskReportStatus[]): string {
  if (!key) return ""
  return statuses.find((s) => s.key === key)?.name ?? getStatusConfig(key).label ?? key.replace(/_/g, " ")
}

/** A step's colour from the job's own flow, else the built-in one. */
function statusHex(key: string, statuses: readonly TaskReportStatus[]): string {
  return statuses.find((s) => s.key === key)?.color || getStatusConfig(key).hex
}

/** "Created from a client request #REF", from a recurring template, as a subtask of … */
function originLabel(r: TaskReport, t: Translate): string | null {
  const o = r.request.origin
  switch (o.kind) {
    case "CUSTOMER_PORTAL":
      return t("tasks.report.origin.portal", { ref: o.portalReference ?? r.header.reference })
    case "RECURRING":
      return o.recurringTemplate?.title
        ? t("tasks.report.origin.recurringNamed", { name: o.recurringTemplate.title })
        : t("tasks.report.origin.recurring")
    case "SUBTASK":
      return o.parent ? t("tasks.report.origin.subtask", { title: o.parent.title }) : null
    default:
      return null
  }
}

export { zonedDayKey, statusHex }
