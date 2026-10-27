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

/** What to save for a typed value — only the kind's own column, every other one cleared. */
export function limitPatch(kind: RuleKind, v: string): Partial<ApprovalRuleInput> {
  const spec = RULE_LIMITS[kind]
  const typed = v.trim() === "" ? null : Math.max(0, Number(v))
  const stored =
    typed == null
      ? null
      : kind === "overtime"
        ? Math.round(typed * 60)
        : kind === "expense"
          ? Math.round(typed * 100)
          : Math.round(typed)
  return {
    minMinutes: spec?.field === "minMinutes" ? stored : null,
    minDays: spec?.field === "minDays" ? stored : null,
    minAmountCents: spec?.field === "minAmountCents" ? stored : null,
  }
}

/** A stored limit as the office reads it. */
export function limitText(t: TFunction, kind: RuleKind, v: number, currency: string): string {
  if (kind === "overtime") return t("approvals.tree.hours", { count: Math.round((v / 60) * 10) / 10 })
  if (kind === "hours") return t("approvals.tree.minutes", { count: v })
  if (kind === "request") return t("approvals.tree.workingDays", { count: v })
  if (kind === "noShow") return t("approvals.tree.days", { count: v })
  return formatMoney(v, currency, dateLocale())
}
