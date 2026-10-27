"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { formatMoney, type ApprovalRuleInput, type ApprovalRuleView } from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { RuleRange } from "../../_lib/rule-range"
import type { RuleRole } from "../../_hooks/use-rules-tree"
import { ChoiceSelect, DoneNode, FlowNode, LIMIT, NONE } from "./tree-nodes"

const HOURS = [4, 24, 48, 72]
/** The bin shows when the row is pointed at or focused — a rule is not deleted by accident while reading. */
const BIN =
  "grid size-8 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-accent " +
  "hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"

/** The limit as the office types it (hours / working days / money) ↔ as the server stores it (minutes / days / cents). */
function limitOf(r: ApprovalRuleView): string {
  const n = r.kind === "overtime" ? r.minMinutes : r.kind === "request" ? r.minDays : r.minAmountCents
  if (n == null) return ""
  return String(r.kind === "overtime" ? Math.round((n / 60) * 10) / 10 : r.kind === "expense" ? n / 100 : n)
}
function limitPatch(kind: ApprovalRuleView["kind"], v: string): Partial<ApprovalRuleInput> {
  const n = v.trim() === "" ? null : Math.max(0, Number(v))
  return {
    minMinutes: kind === "overtime" && n != null ? Math.round(n * 60) : null,
    minDays: kind === "request" && n != null ? Math.round(n) : null,
    minAmountCents: kind === "expense" && n != null ? Math.round(n * 100) : null,
  }
}

/** A stored limit (minutes / working days / cents) as the office reads it. */
export function limitText(t: TFunction, kind: ApprovalRuleView["kind"], v: number, currency: string): string {
  if (kind === "overtime") return t("approvals.tree.hours", { count: Math.round((v / 60) * 10) / 10 })
  if (kind === "request") return t("approvals.tree.workingDays", { count: v })
  return formatMoney(v, currency, dateLocale())
}

export type RulePartName = "head" | "where" | "when" | "also" | "chase" | "done"

/**
 * One piece of a rule's chain, as a node of the canvas: its head (number, on/off, delete), where, when
 * (the range it really covers), who also approves, what happens when nobody answers, and where it ends.
 * Every piece reads the same rule, so they cannot disagree.
 */
export function RulePart({
  part,
  rule,
  n,
  roles,
  workspaces,
  currency,
  range,
  onChange,
  onRemove,
}: {
  part: RulePartName
  rule: ApprovalRuleView
  n: number
  roles: RuleRole[]
  workspaces: { id: string; name: string }[]
  currency: string
  range: RuleRange
  onChange: (patch: Partial<ApprovalRuleInput>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [limit, setLimit] = useState(limitOf(rule))
  useEffect(() => setLimit(limitOf(rule)), [rule])
  const commitLimit = () => limit !== limitOf(rule) && onChange(limitPatch(rule.kind, limit))

  const roleOf = (id: string | null) => roles.find((r) => r.id === id)
  const nobody = (id: string | null) => !!id && (roleOf(id)?.holders ?? 0) === 0
  const roleChoices = roles.map((r) => ({
    value: r.id,
    label: r.inSpace ? t("approvals.tree.inThatWorkspace", { role: r.name }) : r.name,
  }))
  const wait = (h: number) =>
    h % 24 ? t("approvals.tree.hours", { count: h }) : t("approvals.tree.days", { count: h / 24 })
  const hourChoices = HOURS.map((h) => ({ value: String(h), label: wait(h) }))
  const show = (v: number) => limitText(t, rule.kind, v, currency)
  const span =
    range.from != null && range.to != null
      ? t("approvals.tree.range.between", { from: show(range.from), to: show(range.to) })
      : range.from != null
        ? t("approvals.tree.range.over", { from: show(range.from) })
        : range.to != null
          ? t("approvals.tree.range.upTo", { to: show(range.to) })
          : t("approvals.tree.range.all")
  const second = roleOf(rule.secondRoleId)
  const pass = roleOf(rule.escalateRoleId)
  const chase = [
    rule.remindAfterHours != null ? t("approvals.tree.chase.remind", { after: wait(rule.remindAfterHours) }) : null,
    pass ? t("approvals.tree.chase.pass", { role: pass.name, after: wait(rule.escalateAfterHours ?? 48) }) : null,
  ].filter(Boolean)

  const dim = !rule.isActive && "opacity-45"
  switch (part) {
    case "head":
      return (
        <div className={cn("group/row", dim)}>
          <div className="flex h-7 items-center gap-2">
            <span className="text-[12.5px] font-semibold text-muted-foreground">{t("approvals.tree.rule", { n })}</span>
            <Switch
              checked={rule.isActive}
              onCheckedChange={(v) => onChange({ isActive: v })}
              aria-label={t("approvals.rules.active")}
              className="scale-90"
            />
            <button type="button" onClick={onRemove} aria-label={t("approvals.rules.remove")} className={BIN}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
      )
    case "where":
      return (
        <div className={cn(dim)}>
          <FlowNode
            icon="workspaces"
            label={t("approvals.tree.node.where")}
            value={workspaces.find((w) => w.id === rule.spaceId)?.name ?? t("approvals.rules.everywhere")}
            sub={range.notIn.length ? t("approvals.tree.range.notIn", { names: range.notIn.join(", ") }) : undefined}
          >
            <ChoiceSelect
              value={rule.spaceId ?? NONE}
              onChange={(v) => onChange({ spaceId: v === NONE ? null : v })}
              label={t("approvals.rules.where")}
              choices={[
                { value: NONE, label: t("approvals.rules.everywhere") },
                ...workspaces.map((w) => ({ value: w.id, label: w.name })),
              ]}
            />
          </FlowNode>
        </div>
      )
    case "when":
      return (
        <div className={cn(dim)}>
          <FlowNode
            icon="timeLine"
            label={t("approvals.tree.node.when")}
            value={span}
            bad={range.shadowedBy != null}
            sub={
              range.shadowedBy != null
                ? t("approvals.tree.range.twin", { n: range.shadowedBy })
                : rule.whenCoverShort
                  ? t("approvals.tree.coverShort")
                  : undefined
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-muted-foreground">{t("approvals.tree.moreThan")}</span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={limit}
                placeholder={t("approvals.tree.any")}
                onChange={(e) => setLimit(e.target.value)}
                onBlur={commitLimit}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-label={t("approvals.tree.moreThan")}
                className={cn(LIMIT, "w-24 text-center")}
              />
              <span className="text-[13px] text-muted-foreground">
                {t(`approvals.tree.unit.${rule.kind}`, { currency })}
              </span>
            </div>
            {rule.kind === "request" && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox
                  checked={rule.whenCoverShort}
                  onCheckedChange={(v) => onChange({ whenCoverShort: v === true })}
                />
                {t("approvals.tree.coverShort")}
              </label>
            )}
          </FlowNode>
        </div>
      )
    case "also":
      return (
        <div className={cn(dim)}>
          <FlowNode
            icon="userLine"
            label={t("approvals.tree.node.also")}
            value={second?.name ?? t("approvals.tree.nobody")}
            bad={nobody(rule.secondRoleId)}
            sub={
              !second
                ? t("approvals.tree.onlyFirst")
                : second.holders
                  ? t("approvals.tree.holders", { count: second.holders })
                  : t("approvals.tree.nobodyHolds")
            }
          >
            <ChoiceSelect
              value={rule.secondRoleId ?? NONE}
              onChange={(v) => onChange({ secondRoleId: v === NONE ? null : v })}
              label={t("approvals.tree.alsoBy")}
              choices={[{ value: NONE, label: t("approvals.tree.nobodySecond") }, ...roleChoices]}
            />
          </FlowNode>
        </div>
      )
    case "chase":
      return (
        <div className={cn(dim)}>
          <FlowNode
            icon="alarm"
            label={t("approvals.tree.node.chase")}
            value={chase.length ? chase[0] : t("approvals.tree.chase.off")}
            sub={chase[1] ?? undefined}
            bad={nobody(rule.escalateRoleId)}
          >
            <span className="text-[13px] text-muted-foreground">{t("approvals.tree.remindAfter")}</span>
            <ChoiceSelect
              value={rule.remindAfterHours != null ? String(rule.remindAfterHours) : NONE}
              onChange={(v) => onChange({ remindAfterHours: v === NONE ? null : Number(v) })}
              label={t("approvals.tree.remindAfter")}
              choices={[{ value: NONE, label: "—" }, ...hourChoices]}
            />
            <span className="text-[13px] text-muted-foreground">{t("approvals.tree.passTo")}</span>
            <ChoiceSelect
              value={rule.escalateRoleId ?? NONE}
              onChange={(v) =>
                onChange(
                  v === NONE
                    ? { escalateRoleId: null, escalateAfterHours: null }
                    : { escalateRoleId: v, escalateAfterHours: rule.escalateAfterHours ?? 48 },
                )
              }
              label={t("approvals.tree.passTo")}
              choices={[{ value: NONE, label: t("approvals.tree.nobody") }, ...roleChoices]}
              bad={nobody(rule.escalateRoleId)}
            />
            {rule.escalateRoleId && (
              <ChoiceSelect
                value={String(rule.escalateAfterHours ?? 48)}
                onChange={(v) => onChange({ escalateAfterHours: Number(v) })}
                label={t("approvals.tree.after")}
                choices={hourChoices}
              />
            )}
          </FlowNode>
        </div>
      )
    case "done":
      return (
        <div className={cn(dim)}>
          <DoneNode>{rule.secondRoleId ? t("approvals.tree.doneTwo") : t("approvals.tree.doneOne")}</DoneNode>
        </div>
      )
  }
}
