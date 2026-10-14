import { formatDuration, overtimeRoundMinutes, overtimeRoundState, personName, type OvertimeRoundState } from "@hbcfield/shared/client"
import type { OvertimeRequest } from "@/lib/api"

type T = (key: string, opts?: Record<string, unknown>) => string

/** One colour per state, the legend names them all. */
export const STATE_PILL: Record<OvertimeRoundState, string> = {
  RUNNING: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  OVER: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  DONE: "bg-muted text-foreground",
  WAITING_PERSON: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  WAITING_DECISION: "bg-primary/10 text-primary",
  NO_ANSWER: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  NOT_NEEDED: "bg-muted text-muted-foreground",
  REFUSED: "bg-red-500/10 text-red-600 dark:text-red-400",
}

/** The round's facts as the shared rule reads them. */
export function factsOf(r: OvertimeRequest) {
  return {
    status: r.status,
    maxDurationMinutes: r.maxDurationMinutes ?? null,
    overtimeStartAt: r.overtimeStartAt ?? null,
    overtimeEndAt: r.overtimeEndAt ?? null,
    actualEndAt: r.actualEndAt ?? null,
    overtimeMinutes: r.overtimeMinutes ?? null,
    clockOutAt: r.timeEntry?.clockOutAt ?? null,
    superseded: r.superseded ?? false,
  }
}

export function roundOf(r: OvertimeRequest, now: Date) {
  const f = factsOf(r)
  return { state: overtimeRoundState(f, now), ...overtimeRoundMinutes(f, now) }
}

export const mins = (m: number) => formatDuration(Math.max(0, Math.round(m)))

/** A time on the workspace's own clock ("18:02"), with the day when asked. */
export function clock(iso: string | null | undefined, tz: string | null | undefined, lang: string, withDay = false): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const opts: Intl.DateTimeFormatOptions = withDay
    ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }
  try {
    return new Intl.DateTimeFormat(lang, { ...opts, ...(tz ? { timeZone: tz } : {}) }).format(d)
  } catch {
    return new Intl.DateTimeFormat(lang, opts).format(d)
  }
}

/** How it was agreed, in words. */
export function methodWords(t: T, r: OvertimeRequest): string {
  const by = r.approvedBy ? personName(r.approvedBy) : r.leaderName || ""
  switch (r.approvalMethod) {
    case "SIGNATURE":
      return t("overtimePage.method.signed", { name: by || r.leaderName || "" })
    case "AUTOMATIC":
      return t("overtimePage.method.automatic")
    case "MANAGER":
      return t("overtimePage.method.office", { name: by })
    default:
      return by ? t("overtimePage.method.approvals", { name: by }) : ""
  }
}

/** The row's sentence: what happened, in one line. */
export function headline(t: T, r: OvertimeRequest, state: OvertimeRoundState, worked: number, agreed: number): string {
  const name = personName(r.technician) || t("overtimePage.someone")
  const place = r.location?.name ?? ""
  switch (state) {
    case "RUNNING":
    case "OVER":
      return t("overtimePage.line.given", { name, minutes: mins(agreed), place })
    case "DONE":
      return worked > 0 ? t("overtimePage.line.worked", { name, minutes: mins(worked), place }) : t("overtimePage.line.given", { name, minutes: mins(agreed), place })
    case "WAITING_PERSON":
      return t("overtimePage.line.asked", { name, place })
    case "WAITING_DECISION":
      return t("overtimePage.line.waiting", { name, place })
    case "NO_ANSWER":
      return t("overtimePage.line.noAnswer", { name, place })
    case "REFUSED":
      return t("overtimePage.line.refused", { name, by: r.approvedBy ? personName(r.approvedBy) : "" })
    case "NOT_NEEDED":
      return r.status === "CANCELED" ? t("overtimePage.line.declined", { name }) : t("overtimePage.line.noReply", { name })
  }
}
