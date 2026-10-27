"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { RULE_LIMITS, type ApprovalRuleInput, type ApprovalRuleView } from "@hbcfield/shared/client"
import { assetsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { limitInput, limitPatch, limitText } from "../../_lib/rule-limit"
import type { RuleRange } from "../../_lib/rule-range"
import { ChoiceSelect, FlowNode, LIMIT, NONE } from "./tree-nodes"

/**
 * The "When" step of a rule: the range it really covers, and its editor — a number for a kind with a limit
 * (shared RULE_LIMITS), "only when people would be short" for leave, an asset kind for asset papers, "urgent
 * only" for client requests.
 */
export function WhenNode({
  rule,
  range,
  currency,
  onChange,
}: {
  rule: ApprovalRuleView
  range: RuleRange
  currency: string
  onChange: (patch: Partial<ApprovalRuleInput>) => void
}) {
  const { t } = useTranslation()
  const [limit, setLimit] = useState(limitInput(rule))
  useEffect(() => setLimit(limitInput(rule)), [rule])
  const commit = () => limit !== limitInput(rule) && onChange(limitPatch(rule.kind, limit))
  const hasLimit = !!RULE_LIMITS[rule.kind]
  // Asset kinds are read only for an asset-papers rule, and once for every such rule (shared cache).
  const { data: kinds } = useQuery({
    queryKey: keys.assets.categories(null),
    queryFn: () => assetsApi.getCategories(),
    enabled: rule.kind === "assetProposal",
    staleTime: 5 * 60_000,
  })

  const show = (v: number) => limitText(t, rule.kind, v, currency)
  const value =
    rule.kind === "assetProposal"
      ? (rule.categoryName ?? t("approvals.tree.anyAssetKind"))
      : rule.kind === "clientRequest"
        ? rule.urgentOnly
          ? t("approvals.tree.urgentOnly")
          : t("approvals.tree.range.all")
        : range.from != null && range.to != null
          ? t("approvals.tree.range.between", { from: show(range.from), to: show(range.to) })
          : range.from != null
            ? t("approvals.tree.range.over", { from: show(range.from) })
            : range.to != null
              ? t("approvals.tree.range.upTo", { to: show(range.to) })
              : t("approvals.tree.range.all")

  return (
    <FlowNode
      icon="timeLine"
      label={t("approvals.tree.node.when")}
      value={value}
      bad={range.shadowedBy != null}
      sub={
        range.shadowedBy != null
          ? t("approvals.tree.range.twin", { n: range.shadowedBy })
          : rule.whenCoverShort
            ? t("approvals.tree.coverShort")
            : undefined
      }
    >
      {hasLimit && (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">{t("approvals.tree.moreThan")}</span>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={limit}
            placeholder={t("approvals.tree.any")}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label={t("approvals.tree.moreThan")}
            className={cn(LIMIT, "w-24 text-center")}
          />
          <span className="text-[13px] text-muted-foreground">
            {t(`approvals.tree.unit.${rule.kind}`, { currency })}
          </span>
        </div>
      )}
      {rule.kind === "request" && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Checkbox checked={rule.whenCoverShort} onCheckedChange={(v) => onChange({ whenCoverShort: v === true })} />
          {t("approvals.tree.coverShort")}
        </label>
      )}
      {rule.kind === "assetProposal" && (
        <ChoiceSelect
          value={rule.categoryId ?? NONE}
          onChange={(v) => onChange({ categoryId: v === NONE ? null : v })}
          label={t("approvals.tree.assetKind")}
          choices={[
            { value: NONE, label: t("approvals.tree.anyAssetKind") },
            ...(kinds ?? []).map((k) => ({ value: k.id, label: k.name })),
          ]}
        />
      )}
      {rule.kind === "clientRequest" && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Checkbox checked={rule.urgentOnly} onCheckedChange={(v) => onChange({ urgentOnly: v === true })} />
          {t("approvals.tree.urgentOnly")}
        </label>
      )}
    </FlowNode>
  )
}
