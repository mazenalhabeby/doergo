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
import { formatRequestMinutes } from "@/lib/requests"

/*
  A rule's limit as the office TYPES it and READS it, from the shared RULE_LIMITS (which column, which fact):
  overtime and changed hours as hours + minutes, leave in working days, missed clock-ins in days in a row,
  expenses in money. Stored as minutes / days / cents — a duration is typed in whole minutes, so what is
  saved reads back exactly as it was typed (decimal hours turned 50 min into "0.8 h", saved again as 48).
*/

/** A limit that is a duration (stored in minutes): typed in two fields, hours and minutes, and read as "1 h 30 min". */
export const isDurationKind = (kind: RuleKind) => RULE_LIMITS[kind]?.field === "minMinutes"

/** The value in the field the office types into ("" = no limit) — for a duration, its total minutes. */
export function limitInput(r: ApprovalRuleView): string {
  const n = ruleLimitOf(r)
  if (n == null) return ""
  if (r.kind === "expense") return String(n / 100)
  return String(n)
}

/** A duration's total minutes ("" = no limit) as the hours and minutes fields show it. */
export function durationFields(minutes: string): { h: string; m: string } {
  if (minutes.trim() === "") return { h: "", m: "" }
  const n = Math.max(0, Math.round(Number(minutes) || 0))
  return { h: String(Math.floor(n / 60)), m: String(n % 60) }
}

/** The hours and minutes fields back into total minutes ("" when both are empty: no limit). */
export function durationValue(h: string, m: string): string {
  if (h.trim() === "" && m.trim() === "") return ""
  const whole = (v: string) => Math.max(0, Math.floor(Number(v) || 0))
  return String(whole(h) * 60 + whole(m))
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

/** What to save for a typed value (total minutes / days / money), capped at the kind's ceiling. */
export function limitPatch(kind: RuleKind, v: string): Partial<ApprovalRuleInput> {
  const typed = v.trim() === "" ? null : Math.max(0, Number(v))
  if (typed == null || !Number.isFinite(typed)) return limitFields(kind, null)
  const stored = Math.round(kind === "expense" ? typed * 100 : typed)
  return limitFields(kind, Math.min(stored, RULE_LIMITS[kind]?.max ?? stored))
}

/** The highest value the field takes, in the unit the office types (the kind's stored ceiling). */
export function limitMax(kind: RuleKind): number | undefined {
  const max = RULE_LIMITS[kind]?.max
  if (max == null) return undefined
  return kind === "expense" ? max / 100 : max
}

/** A stored limit as the office reads it. */
export function limitText(t: TFunction, kind: RuleKind, v: number, currency: string): string {
  if (isDurationKind(kind)) return formatRequestMinutes(v, (key, o) => t(key, o))
  if (kind === "request") return t("approvals.tree.workingDays", { count: v })
  if (kind === "noShow") return t("approvals.tree.days", { count: v })
  return formatMoney(v, currency, dateLocale())
}
