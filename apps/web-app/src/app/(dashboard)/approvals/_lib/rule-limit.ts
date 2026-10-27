import type { TFunction } from "i18next"
import {
  RULE_LIMITS,
  formatMoney,
  ruleLimitOf,
  type ApprovalRuleInput,
  type ApprovalRuleView,
  type RuleKind,
} from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"
import { currencySymbol } from "@/lib/money"
import { formatRequestMinutes } from "@/lib/requests"

/*
  A rule's limit as the office TYPES it and READS it, from the shared RULE_LIMITS (which column, which fact):
  overtime and changed hours as hours + minutes, leave in working days, missed clock-ins in days in a row,
  expenses in money. Stored as minutes / days / cents — a duration is kept in whole minutes and shown as hours
  + minutes, so what is saved reads back exactly (decimal hours turned 50 min into "0.8 h", saved again as 48);
  decimal hours may still be TYPED ("1.5" or "1,5" h is 90 min) and then read back as 1 h 30 min.
*/

/** A limit that is a duration (stored in minutes): typed in two fields, hours and minutes, and read as "1 h 30 min". */
export const isDurationKind = (kind: RuleKind) => RULE_LIMITS[kind]?.field === "minMinutes"

/** The value in the field the office types into ("" = no limit) — for a duration, its total minutes. */
export function limitInput(r: ApprovalRuleView): string {
  const n = ruleLimitOf(r)
  if (n == null) return ""
  if (r.kind === "expense") return moneyInput(n)
  return String(n)
}

/** Cents as the money field shows them, in the reader's decimal style ("12,50" / "12.50", whole euros "1000"). */
function moneyInput(cents: number): string {
  return (cents / 100).toLocaleString(dateLocale(), {
    useGrouping: false,
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

/**
 * A duration's total minutes ("" = no limit) as the hours and minutes fields show it. A whole number of hours
 * leaves the minutes empty, so clearing the hours clears the limit (a "0" there would save "more than 0 min").
 */
export function durationFields(minutes: string): { h: string; m: string } {
  if (minutes.trim() === "") return { h: "", m: "" }
  const n = Math.max(0, Math.round(Number(minutes) || 0))
  return { h: n >= 60 ? String(Math.floor(n / 60)) : "", m: n % 60 ? String(n % 60) : "" }
}

/**
 * A number as the office types it, with a comma or a dot as the decimal separator ("1,5" is "1.5"): "" for an
 * empty field, null for one that cannot be read (letters, a minus sign, a misplaced separator). The fields are
 * text, not number inputs: Safari reports a decimal comma in a number input as EMPTY, and an empty field is
 * "no limit" — "1,5" would have saved a rule that catches everything.
 *
 * "1.000" is never read as 1. Money (`money`) takes thousands separators either way round — "1.000", "1,000",
 * "1.000,50", "1,000.50" — a lone separator followed by exactly three digits being a thousands group; what is
 * still ambiguous ("0,500", "1234.567") is refused. Every other limit (hours, minutes, days) has no use for a
 * thousands separator, so a separator followed by exactly three digits is REFUSED there rather than guessed.
 */
export function readLimitNumber(v: string, money = false): number | "" | null {
  const s = v.trim()
  if (s === "") return ""
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const seps = s.match(/[.,]/g) ?? []
  if (seps.length === 0) return Number(s)
  if (!money) {
    if (seps.length > 1 || /^\d+[.,]\d{3}$/.test(s)) return null
    return Number(s.replace(",", "."))
  }
  return readMoney(s)
}

/** Grouped thousands: 1–3 digits, then groups of exactly three ("1.000.000"), never a leading 0. */
const grouped = (s: string, sep: string) => new RegExp(`^[1-9]\\d{0,2}(\\${sep}\\d{3})+$`).test(s)

/** Money with either separator for thousands and the other (or a lone one, not followed by three digits) for cents. */
function readMoney(s: string): number | null {
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","))
  const [whole, cents] = [s.slice(0, last), s.slice(last + 1)]
  const sep = s[last]!
  const other = sep === "." ? "," : "."
  // Both separators: the last one is the decimal, the other only groups thousands ("1.000,50", "1,000.50").
  if (whole.includes(other)) {
    if (whole.includes(sep) || !grouped(whole, other) || !/^\d{1,2}$/.test(cents)) return null
    return Number(whole.split(other).join("") + "." + cents)
  }
  // One kind, several times: thousands groups only ("1.000.000").
  if (whole.includes(sep)) return grouped(s, sep) ? Number(s.split(sep).join("")) : null
  // One separator: three digits after it is a thousands group ("1.000"); 1–2 (or none) are cents ("12,50", "12.").
  if (cents.length === 3) return grouped(s, sep) ? Number(whole + cents) : null
  if (cents.length > 3 || (whole === "" && cents === "")) return null
  return Number((whole || "0") + "." + (cents || "0"))
}

/**
 * The hours and minutes fields back into total minutes. Hours may be decimal ("1.5" or "1,5" is 90 min); an empty
 * field counts as nothing; a total of 0 — both empty, or only zeros — is no limit (""). Null when either field
 * cannot be read: never "no limit".
 */
export function durationValue(h: string, m: string): string | null {
  const [hours, minutes] = [readLimitNumber(h), readLimitNumber(m)]
  if (hours === null || minutes === null) return null
  const total = Math.round((hours || 0) * 60 + (minutes || 0))
  return total > 0 ? String(total) : ""
}

/** A limit in its STORED unit into the kind's own column — every other limit column cleared. */
export function limitFields(kind: RuleKind, stored: number | null): Partial<ApprovalRuleInput> {
  const field = RULE_LIMITS[kind]?.field
  return {
    minMinutes: field === "minMinutes" ? stored : null,
    minDays: field === "minDays" ? stored : null,
    minAmountCents: field === "minAmountCents" ? stored : null,
  }
}

/**
 * What to save for a typed value (total minutes / days / money), capped at the kind's ceiling. Null when it
 * cannot be read — the saved limit then stays; only an EMPTY field removes it.
 */
export function limitPatch(kind: RuleKind, v: string): Partial<ApprovalRuleInput> | null {
  const typed = readLimitNumber(v, kind === "expense")
  if (typed === null) return null
  if (typed === "") return limitFields(kind, null)
  const stored = Math.round(kind === "expense" ? typed * 100 : typed)
  return limitFields(kind, Math.min(stored, RULE_LIMITS[kind]?.max ?? stored))
}

/** The highest value the field takes, in the unit the office types (the kind's stored ceiling). */
export function limitMax(kind: RuleKind): number | undefined {
  const max = RULE_LIMITS[kind]?.max
  if (max == null) return undefined
  return kind === "expense" ? max / 100 : max
}

/** Was the typed value above the kind's ceiling (so what is saved is the ceiling, not what was typed)? */
export function limitCapped(kind: RuleKind, v: string): boolean {
  const max = limitMax(kind)
  const typed = readLimitNumber(v, kind === "expense")
  return typeof typed === "number" && max != null && typed > max
}

/** What a patch from `limitPatch` saves, back in the field's own form ("" = no limit). */
export function limitPatchInput(kind: RuleKind, patch: Partial<ApprovalRuleInput>): string {
  return limitInput({ kind, minMinutes: null, minDays: null, minAmountCents: null, ...patch } as ApprovalRuleView)
}

/** A stored limit as the office reads it. */
export function limitText(t: TFunction, kind: RuleKind, v: number, currency: string): string {
  if (isDurationKind(kind)) return formatRequestMinutes(v, (key, o) => t(key, o))
  if (kind === "request") return t("approvals.tree.workingDays", { count: v })
  if (kind === "noShow") return t("approvals.tree.daysInARow", { count: v })
  return formatMoney(v, currency, dateLocale())
}

/** The currency's symbol in the reader's language ("€", not "EUR") — the one money helper's. */
export const limitCurrencySymbol = (currency: string) => currencySymbol(currency, dateLocale())
