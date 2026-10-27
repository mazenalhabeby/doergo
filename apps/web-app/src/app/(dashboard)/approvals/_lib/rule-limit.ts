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

/*
  A rule's limit as the office TYPES it and READS it, from the shared RULE_LIMITS (which column, which fact):
  overtime in hours, changed hours in minutes, leave in working days, missed clock-ins in days in a row,
  expenses in money. Stored as minutes / days / cents.
*/

/** The value in the field the office types into ("" = no limit). */
export function limitInput(r: ApprovalRuleView): string {
  const n = ruleLimitOf(r)
  if (n == null) return ""
  if (r.kind === "overtime") return String(Math.round((n / 60) * 10) / 10)
  if (r.kind === "expense") return String(n / 100)
  return String(n)
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

/** What to save for a typed value (hours / minutes / days / money), capped at the kind's ceiling. */
export function limitPatch(kind: RuleKind, v: string): Partial<ApprovalRuleInput> {
  const typed = v.trim() === "" ? null : Math.max(0, Number(v))
  if (typed == null || !Number.isFinite(typed)) return limitFields(kind, null)
  const stored = Math.round(kind === "overtime" ? typed * 60 : kind === "expense" ? typed * 100 : typed)
  return limitFields(kind, Math.min(stored, RULE_LIMITS[kind]?.max ?? stored))
}

/** The highest value the field takes, in the unit the office types (the kind's stored ceiling). */
export function limitMax(kind: RuleKind): number | undefined {
  const max = RULE_LIMITS[kind]?.max
  if (max == null) return undefined
  return kind === "overtime" ? max / 60 : kind === "expense" ? max / 100 : max
}

/** A stored limit as the office reads it. */
export function limitText(t: TFunction, kind: RuleKind, v: number, currency: string): string {
  if (kind === "overtime") return t("approvals.tree.hours", { count: Math.round((v / 60) * 10) / 10 })
  if (kind === "hours") return t("approvals.tree.minutes", { count: v })
  if (kind === "request") return t("approvals.tree.workingDays", { count: v })
  if (kind === "noShow") return t("approvals.tree.days", { count: v })
  return formatMoney(v, currency, dateLocale())
}
