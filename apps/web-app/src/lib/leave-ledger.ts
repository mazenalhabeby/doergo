/**
 * The leave ledger as the web SHOWS it. Every number comes from the server or
 * from the shared contract (`@hbcfield/shared` leave/leave-ledger.ts); nothing
 * here decides a balance — it lays out what was decided.
 */
import {
  leaveBalance,
  LEAVE_ADJUSTMENT_LIMITS,
  type LeaveBalanceLine,
  type LeaveYear,
} from "@hbcfield/shared/client"
import type { LeaveBalance } from "./api/types/employees"

/** Half days, never rounding a person's days away (the contract's own rule). */
const half = (n: number) => Math.round(n * 2) / 2

/** i18n key for each line of a balance, in the contract's order. */
export const LEAVE_LINE_LABEL_KEY: Record<LeaveBalanceLine["key"], string> = {
  ALLOWANCE: "leaveLedger.lines.ALLOWANCE",
  OPENING_USED: "leaveLedger.lines.OPENING_USED",
  CARRY_OVER: "leaveLedger.lines.CARRY_OVER",
  CARRY_EXPIRED: "leaveLedger.lines.CARRY_EXPIRED",
  GRANT: "leaveLedger.lines.GRANT",
  CORRECTION: "leaveLedger.lines.CORRECTION",
  TAKEN: "leaveLedger.lines.TAKEN",
}

export interface BalanceView {
  lines: LeaveBalanceLine[]
  allowance: number
  remaining: number
  pending: number
  /** null on an older server — the label then falls back to the year number. */
  leaveYear: LeaveYear | null
  /** Calendar year of the balance, for the old label. */
  year: number
  carryExpiresOn: string | null
}

/**
 * The lines to draw. A server with the ledger sends them; an older one sends
 * allowance/taken only, and the SAME shared `leaveBalance` lays those out — so
 * the breakdown looks identical either way, just with fewer lines.
 */
export function balanceView(balance: LeaveBalance | null | undefined): BalanceView | null {
  if (!balance) return null
  const lines = Array.isArray(balance.lines) && balance.lines.length > 0
    ? balance.lines
    : leaveBalance({ allowance: balance.allowance ?? 0, adjustments: [], taken: balance.taken ?? 0, pending: balance.pending ?? 0 }).lines
  return {
    lines,
    allowance: balance.allowance ?? 0,
    remaining: balance.remaining ?? 0,
    pending: balance.pending ?? 0,
    leaveYear: balance.leaveYear ?? null,
    year: balance.year ?? new Date().getFullYear(),
    carryExpiresOn: balance.carryExpiresOn ?? null,
  }
}

/** What would be left once a request of `days` working days is approved. */
export function remainingAfter(remaining: number, days: number): number {
  return half(remaining - Math.max(0, days))
}

/**
 * A line's days as the breakdown prints them: the allowance plain, every other
 * line signed with a true minus (U+2212), decimals in the reader's locale
 * ("10,5" in German).
 */
export function formatLineDays(line: Pick<LeaveBalanceLine, "key" | "days">, locale?: string): string {
  const abs = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.abs(line.days))
  if (line.key === "ALLOWANCE") return line.days < 0 ? `−${abs}` : abs
  return `${line.days < 0 ? "−" : "+"}${abs}`
}

/** A signed day count with no line key (an adjustment row). */
export function formatSignedDays(days: number, locale?: string): string {
  return formatLineDays({ key: "CORRECTION", days }, locale)
}

/** Plain days in the reader's locale. */
export function formatDays(days: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(days)
}

/**
 * How to name the leave year: the calendar year by its number, a work year by
 * its two ends ("15 Apr – 14 Apr"). `dayMonth` formats a YYYY-MM-DD as day+month.
 */
export type LeaveYearLabel =
  | { kind: "calendar"; year: number }
  | { kind: "work"; from: string; to: string }

export function leaveYearLabel(view: Pick<BalanceView, "leaveYear" | "year">, dayMonth: (isoDay: string) => string): LeaveYearLabel {
  const y = view.leaveYear
  if (y && y.mode === "WORK_YEAR") return { kind: "work", from: dayMonth(y.start), to: dayMonth(y.end) }
  return { kind: "calendar", year: y ? Number(y.start.slice(0, 4)) : view.year }
}

/* ------------------------------------------------------------ starting balances */

/**
 * A typed day count: empty is 0, "10,5" reads 10.5, half days only, 0–366.
 * null = not a number this table accepts (the cell shows it and Save waits).
 */
export function parseDaysInput(raw: string): number | null {
  const s = raw.trim().replace(",", ".")
  if (s === "") return 0
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > LEAVE_ADJUSTMENT_LIMITS.MAX_ABS_DAYS || half(n) !== n) return null
  return n
}

/** One editable row: the inputs are kept as typed, so "10," mid-typing is not snapped away. */
export interface OpeningDraftRow {
  userId: string
  name: string
  email: string
  used: string
  carried: string
  /** The person's own leave year (a work year differs per person). */
  leaveYear?: LeaveYear
}

const cell = (n: number | null | undefined) => (n ? String(n) : "")

export function openingDraft(
  rows: ReadonlyArray<{
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    used: number;
    carried: number;
    leaveYear?: LeaveYear
  }>,
): OpeningDraftRow[] {
  return rows
    .map((r) => ({
      userId: r.userId,
      name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email,
      email: r.email,
      used: cell(r.used),
      carried: cell(r.carried),
      ...(r.leaveYear ? { leaveYear: r.leaveYear } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Fill the table from what the server matched. Rows it did not match keep what they had. */
export function applyOpeningMatches(
  draft: readonly OpeningDraftRow[],
  matches: ReadonlyArray<{ userId: string; used: number; carried: number }>,
): { draft: OpeningDraftRow[]; filled: number } {
  const byUser = new Map(matches.map((m) => [m.userId, m]))
  let filled = 0
  const next = draft.map((r) => {
    const m = byUser.get(r.userId)
    if (!m) return r
    filled++
    return { ...r, used: cell(m.used), carried: cell(m.carried) }
  })
  return { draft: next, filled }
}

/** The body Save sends — every row, or the user ids whose cells cannot be read. */
export function openingSaveRows(draft: readonly OpeningDraftRow[]):
  | { ok: true; rows: Array<{ userId: string; used: number; carried: number }> }
  | { ok: false; invalid: string[] } {
  const rows: Array<{ userId: string; used: number; carried: number }> = []
  const invalid: string[] = []
  for (const r of draft) {
    const used = parseDaysInput(r.used)
    const carried = parseDaysInput(r.carried)
    if (used === null || carried === null) invalid.push(r.userId)
    else rows.push({ userId: r.userId, used, carried })
  }
  return invalid.length ? { ok: false, invalid } : { ok: true, rows }
}

/** The day the screen's leave year is asked about: today, as a local YYYY-MM-DD. */
export function todayKey(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
