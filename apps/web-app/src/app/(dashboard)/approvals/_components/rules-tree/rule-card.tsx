"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ApprovalRuleInput, ApprovalRuleView } from "@hbcfield/shared/client"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { RuleRole } from "../../_hooks/use-rules-tree"
import { ChoiceSelect, DoneNode, LIMIT, NONE, Stem, TreeLine, TreeNode } from "./tree-nodes"

const HOURS = ["4", "24", "48", "72"]

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

/** One rule, as a branch of the tree: where and past what limit → who also approves → when nobody answers. */
export function RuleCard({
  rule,
  n,
  roles,
  workspaces,
  currency,
  onChange,
  onRemove,
}: {
  rule: ApprovalRuleView
  n: number
  roles: RuleRole[]
  workspaces: { id: string; name: string }[]
  currency: string
  onChange: (patch: Partial<ApprovalRuleInput>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [limit, setLimit] = useState(limitOf(rule))
  useEffect(() => setLimit(limitOf(rule)), [rule])
  const commitLimit = () => limit !== limitOf(rule) && onChange(limitPatch(rule.kind, limit))

  const role = roles.find((r) => r.id === rule.secondRoleId)
  const nobody = (id: string | null) => !!id && (roles.find((r) => r.id === id)?.holders ?? 0) === 0
  const roleChoices = roles.map((r) => ({
    value: r.id,
    label: r.inSpace ? t("approvals.tree.inThatWorkspace", { role: r.name }) : r.name,
  }))
  const hourChoices = HOURS.map((h) => {
    const n = Number(h)
    return {
      value: h,
      label: n % 24 ? t("approvals.tree.hours", { count: n }) : t("approvals.tree.days", { count: n / 24 }),
    }
  })
  const unit = t(`approvals.tree.unit.${rule.kind}`, { currency })

  return (
    <div className={cn("flex w-full flex-col items-center", !rule.isActive && "opacity-50")}>
      <TreeNode wide className="gap-2.5">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[12.5px] font-semibold text-muted-foreground">
            {t("approvals.tree.rule", { n })}
          </span>
          <Switch
            checked={rule.isActive}
            onCheckedChange={(v) => onChange({ isActive: v })}
            aria-label={t("approvals.rules.active")}
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("approvals.rules.remove")}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
        <TreeLine label={t("approvals.tree.in")}>
          <ChoiceSelect
            value={rule.spaceId ?? NONE}
            onChange={(v) => onChange({ spaceId: v === NONE ? null : v })}
            label={t("approvals.rules.where")}
            choices={[
              { value: NONE, label: t("approvals.rules.everywhere") },
              ...workspaces.map((w) => ({ value: w.id, label: w.name })),
            ]}
          />
        </TreeLine>
        <TreeLine label={t("approvals.tree.moreThan")}>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={limit}
            placeholder={t("approvals.tree.any")}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={commitLimit}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label={unit}
            className={cn(LIMIT, "w-20 text-center")}
          />
          <span className="text-[13px] text-muted-foreground">{unit}</span>
        </TreeLine>
        {rule.kind === "request" && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox checked={rule.whenCoverShort} onCheckedChange={(v) => onChange({ whenCoverShort: v === true })} />
            {t("approvals.tree.coverShort")}
          </label>
        )}
      </TreeNode>

      <Stem />
      <TreeNode wide bad={nobody(rule.secondRoleId)} icon="userLine">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("approvals.tree.alsoBy")}</span>
          <ChoiceSelect
            value={rule.secondRoleId ?? NONE}
            onChange={(v) => onChange({ secondRoleId: v === NONE ? null : v })}
            label={t("approvals.tree.alsoBy")}
            choices={[{ value: NONE, label: t("approvals.tree.nobodySecond") }, ...roleChoices]}
          />
          <span
            className={cn("text-[11.5px]", nobody(rule.secondRoleId) ? "text-shell-crit" : "text-muted-foreground")}
          >
            {!role
              ? t("approvals.tree.onlyFirst")
              : role.holders
                ? t("approvals.tree.holders", { count: role.holders })
                : t("approvals.tree.nobodyHolds")}
          </span>
        </div>
      </TreeNode>

      <Stem />
      <div className="flex w-full flex-col gap-2 rounded-2xl border border-dashed border-border bg-card px-3 py-2.5 text-[13px]">
        <span className="font-semibold">{t("approvals.rules.noAnswer")}</span>
        <TreeLine label={t("approvals.tree.remindAfter")}>
          <ChoiceSelect
            value={rule.remindAfterHours != null ? String(rule.remindAfterHours) : NONE}
            onChange={(v) => onChange({ remindAfterHours: v === NONE ? null : Number(v) })}
            label={t("approvals.tree.remindAfter")}
            choices={[{ value: NONE, label: "—" }, ...hourChoices]}
          />
        </TreeLine>
        <TreeLine label={t("approvals.tree.passTo")}>
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
            <>
              <span className="text-muted-foreground">{t("approvals.tree.after")}</span>
              <ChoiceSelect
                value={String(rule.escalateAfterHours ?? 48)}
                onChange={(v) => onChange({ escalateAfterHours: Number(v) })}
                label={t("approvals.tree.after")}
                choices={hourChoices}
              />
            </>
          )}
        </TreeLine>
      </div>
      <Stem />
      <DoneNode>{rule.secondRoleId ? t("approvals.tree.doneTwo") : t("approvals.tree.doneFirst")}</DoneNode>
    </div>
  )
}
