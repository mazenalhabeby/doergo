"use client"

import { useTranslation } from "react-i18next"
import type { ApprovalRuleInput, ApprovalRuleView } from "@hbcfield/shared/client"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { RuleRange } from "../../_lib/rule-range"
import type { RuleRole } from "../../_hooks/use-rules-tree"
import { ChoiceSelect, DoneNode, FlowNode, NONE } from "./tree-nodes"
import { WhenNode } from "./when-node"

const HOURS = [4, 24, 48, 72]
/** The bin shows when the row is pointed at or focused — a rule is not deleted by accident while reading. */
const BIN =
  "grid size-8 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-accent " +
  "hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"

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
  hits,
  everywhere = true,
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
  hits?: number
  /** May this caller set a rule for every workspace (not when they manage rules in some only)? */
  everywhere?: boolean
  onChange: (patch: Partial<ApprovalRuleInput>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()

  const roleOf = (id: string | null) => roles.find((r) => r.id === id)
  const nobody = (id: string | null) => !!id && (roleOf(id)?.holders ?? 0) === 0
  const roleChoices = roles.map((r) => ({
    value: r.id,
    label: r.inSpace ? t("approvals.tree.inThatWorkspace", { role: r.name }) : r.name,
  }))
  const wait = (h: number) =>
    h % 24 ? t("approvals.tree.hours", { count: h }) : t("approvals.tree.days", { count: h / 24 })
  const hourChoices = HOURS.map((h) => ({ value: String(h), label: wait(h) }))
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
            {hits != null && (
              <span className="rounded-full bg-shell-chip px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
                {t("approvals.tree.smart.hits", { count: hits })}
              </span>
            )}
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
          <WhenNode rule={rule} range={range} currency={currency} onChange={onChange} />
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
