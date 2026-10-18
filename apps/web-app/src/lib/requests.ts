import {
  REQUEST_KINDS,
  isAbsence,
  isRequestKind,
  parseRequestInput,
  requestKindOf,
  type LeaveType,
  type RequestInput,
  type RequestInputError,
  type RequestKind
} from "@hbcfield/shared/client"

/**
 * Requests on the web — the words around the shared contract
 * (`packages/shared/src/requests/request-kinds.ts`), never a second copy of it.
 *
 * What a kind IS, which kinds are offered and whether a request is valid are
 * all answered by the shared module; this file only says how the web PRINTS a
 * request (label keys, the one-line detail) and turns a form's state into the
 * body the shared parser accepts. The form, the member's history, the member
 * tab and the manager's drawer all read it, so a kind is named the same way on
 * every screen.
 *
 * Pure — no React, no icons. `components/requests/request-kind.tsx` adds those.
 */

export { REQUEST_KINDS, isAbsence, requestKindOf }
export type { RequestKind }

/** i18n key of a kind's name ("Leave", "Remote day", …). */
export const requestKindLabelKey = (kind: string | null | undefined): string => `requests.kinds.${requestKindOf(kind)}.label`
/** i18n key of a kind's one-line explanation, shown under it in the picker. */
export const requestKindHintKey = (kind: RequestKind): string => `requests.kinds.${kind}.hint`
/** i18n key of what approving a kind does — said before sending, and to the manager deciding. */
export const requestKindEffectKey = (kind: RequestKind): string => `requests.kinds.${kind}.effect`

/**
 * The leave type → the existing reason-card key. The web has always named
 * leave types with these keys (`timeOff.reasonTypes.*`), and the phone composes
 * the same words, so they are reused rather than duplicated.
 */
export const LEAVE_TYPE_REASON_KEY: Record<LeaveType, "vacation" | "sickLeave" | "family" | "other"> = {
  VACATION: "vacation",
  SICK: "sickLeave",
  FAMILY: "family",
  OTHER: "other",
}

/** The two kinds that are about ONE day: a changed day, and overtime agreed in advance. */
export function isOneDayKind(kind: RequestKind): boolean {
  return kind === "HOURS" || kind === "OVERTIME"
}

/** Only leave is an absence. Every list that draws "days off" passes through this. */
export function absencesOnly<T extends { kind?: string | null }>(list: readonly T[]): T[] {
  return list.filter((r) => isAbsence(r.kind))
}

type Translate = (key: string, opts?: Record<string, unknown>) => string

/** "2 h 30 min", "45 min", "3 h" — a duration as a person reads it. */
export function formatRequestMinutes(minutes: number, t: Translate): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h && rest) return t("requests.duration.hoursMinutes", { h, m: rest })
  if (h) return t("requests.duration.hours", { h })
  return t("requests.duration.minutes", { m: rest })
}

/** The part of a request that is not its dates — the thing actually being asked. */
interface RequestFacts {
  kind?: string | null
  type?: string | null
  space?: { id?: string; name: string } | null
  startTime?: string | null
  endTime?: string | null
  minutes?: number | null
}

/**
 * One short line naming what is asked, beside the dates: the leave type, the
 * workspace of a remote day, a changed day's new hours, the overtime agreed.
 * Null when there is nothing beyond the kind itself (OTHER — its words are the
 * reason, printed separately).
 */
export function requestDetail(r: RequestFacts, t: Translate): string | null {
  switch (requestKindOf(r.kind)) {
    case "LEAVE": {
      const key = LEAVE_TYPE_REASON_KEY[(r.type as LeaveType) ?? "VACATION"]
      return key ? t(`timeOff.reasonTypes.${key}`) : null
    }
    case "REMOTE":
      return r.space?.name ?? null
    case "HOURS":
      if (r.startTime && r.endTime) return t("requests.detail.hoursBoth", { start: r.startTime, end: r.endTime })
      if (r.startTime) return t("requests.detail.hoursStart", { start: r.startTime })
      if (r.endTime) return t("requests.detail.hoursEnd", { end: r.endTime })
      return null
    case "OVERTIME":
      return r.minutes ? t("requests.detail.overtime", { duration: formatRequestMinutes(r.minutes, t) }) : null
    default:
      return null
  }
}

/** What the request form holds, whatever the kind. */
interface RequestDraft {
  kind: RequestKind
  startDate: string | null
  endDate: string | null
  leaveType?: LeaveType | null
  spaceId?: string | null
  startTime?: string | null
  endTime?: string | null
  minutes?: number | null
  reason?: string | null
}

/**
 * The form → the body, through the SAME parser the server runs. The form can
 * then refuse exactly what the server would refuse, in the same words (the
 * codes are translated under `serverErrors`), and never anything else.
 */
export function draftToRequest(
  d: RequestDraft,
): { ok: true; value: RequestInput } | { ok: false; code: RequestInputError } {
  const one = isOneDayKind(d.kind)
  return parseRequestInput({
    kind: d.kind,
    startDate: d.startDate ?? "",
    endDate: one ? d.startDate ?? "" : d.endDate ?? d.startDate ?? "",
    ...(d.kind === "LEAVE" ? { type: d.leaveType ?? "VACATION" } : {}),
    spaceId: d.spaceId || null,
    startTime: d.startTime || null,
    endTime: d.endTime || null,
    ...(d.minutes != null ? { minutes: d.minutes } : {}),
    reason: d.reason ?? null,
  })
}

/** What GET /employees/me/request-options answers: the kinds offered here, and where a remote day may be filed. */
export interface RequestOptions {
  kinds: RequestKind[]
  remoteSpaces: { id: string; name: string }[]
}

/** Before the server knows about requests — or when it cannot say — a member can still ask for leave. */
export const LEAVE_ONLY_OPTIONS: RequestOptions = { kinds: ["LEAVE"], remoteSpaces: [] }

/**
 * Read the server's answer defensively: unknown kinds dropped, the contract's
 * order kept, REMOTE dropped when there is nowhere to file it (a remote request
 * without a workspace is refused, so offering it would be a dead end).
 */
export function normalizeRequestOptions(raw: unknown): RequestOptions {
  const b = (raw && typeof raw === "object" ? raw : {}) as { kinds?: unknown; remoteSpaces?: unknown }
  const remoteSpaces = Array.isArray(b.remoteSpaces)
    ? b.remoteSpaces
        .filter((s): s is { id: string; name: string } => !!s && typeof s.id === "string" && typeof s.name === "string")
        .map((s) => ({ id: s.id, name: s.name }))
    : []
  const listed = Array.isArray(b.kinds) ? b.kinds.filter(isRequestKind) : []
  const kinds = REQUEST_KINDS.filter((k) => listed.includes(k) && (k !== "REMOTE" || remoteSpaces.length > 0))
  return kinds.length ? { kinds, remoteSpaces } : LEAVE_ONLY_OPTIONS
}

/**
 * A workspace's "Requests members can send here", as switches.
 *
 * Stored as a list where EMPTY MEANS EVERY KIND (the shared default), so:
 *   - a kind is ON when the list is empty or names it;
 *   - switching the last ON kind off is refused (null) — an empty list would
 *     silently mean "everything" again, the opposite of what was asked;
 *   - a list that ends up naming every kind is saved as [] — the same meaning,
 *     and a kind added to the product later is then offered here too.
 */
export function requestKindsEnabled(stored: readonly string[] | null | undefined): RequestKind[] {
  const listed = (stored ?? []).filter(isRequestKind)
  return listed.length ? REQUEST_KINDS.filter((k) => listed.includes(k)) : [...REQUEST_KINDS]
}

export function toggleRequestKind(
  stored: readonly string[] | null | undefined,
  kind: RequestKind,
  on: boolean,
): RequestKind[] | null {
  const now = requestKindsEnabled(stored)
  const next = on ? REQUEST_KINDS.filter((k) => k === kind || now.includes(k)) : now.filter((k) => k !== kind)
  if (!next.length) return null
  return next.length === REQUEST_KINDS.length ? [] : next
}
