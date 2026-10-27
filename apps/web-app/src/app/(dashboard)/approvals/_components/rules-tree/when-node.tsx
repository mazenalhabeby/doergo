"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { RULE_LIMITS, type ApprovalRuleInput, type ApprovalRuleView } from "@hbcfield/shared/client"
import { assetsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  durationFields,
  durationValue,
  isDurationKind,
  limitCapped,
  limitInput,
  limitMax,
  limitPatch,
  limitPatchInput,
  limitText,
} from "../../_lib/rule-limit"
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
  const stored = limitInput(rule)
  const [limit, setLimit] = useState(stored)
  // A duration is typed as hours and minutes, each its own field.
  const duration = isDurationKind(rule.kind)
  const [hm, setHm] = useState(() => durationFields(stored))
  // The last value sent (or read back): blur and the editor closing both commit — the same value is sent once.
  const sent = useRef(stored)
  // Typed above the kind's ceiling: what is saved is the ceiling, and the editor says so.
  const [capped, setCapped] = useState(false)
  // Typed something that is not a number: nothing is saved, the fields go back to the saved limit, and it says so.
  const [unreadable, setUnreadable] = useState(false)
  // Follows the SAVED value only when it changes — a refetch of the same rule never wipes what is being typed.
  useEffect(() => {
    sent.current = stored
    setLimit(stored)
    setHm(durationFields(stored))
  }, [stored])
  const typed = duration ? durationValue(hm.h, hm.m) : limit
  // Saved on Enter, on leaving the field, and when the editor closes (Escape or a click away) — never on unmount,
  // which is also what a DELETED rule does. The fields then show what was SAVED (1.5 h reads 1 h 30 min).
  const commit = () => {
    const patch = typed == null ? null : limitPatch(rule.kind, typed)
    setUnreadable(!patch)
    if (!patch || typed == null) {
      setCapped(false)
      setLimit(sent.current)
      setHm(durationFields(sent.current))
      return
    }
    const saved = limitPatchInput(rule.kind, patch)
    setCapped(limitCapped(rule.kind, typed))
    setLimit(saved)
    setHm(durationFields(saved))
    if (saved === sent.current) return
    sent.current = saved
    onChange(patch)
  }
  // Under the fields, one line: "No limit" while they are empty (no placeholder to clip), that it was capped, or
  // that what was typed could not be read.
  const hintId = `rule-limit-hint-${rule.id}`
  const max = limitMax(rule.kind)
  const hint = unreadable
    ? t("approvals.tree.unreadable")
    : typed === ""
      ? t("approvals.tree.noLimit")
      : capped && max != null
        ? t("approvals.tree.capped", {
            max: limitText(t, rule.kind, rule.kind === "expense" ? max * 100 : max, currency),
          })
        : null
  const hasLimit = !!RULE_LIMITS[rule.kind]
  // Text with a number keyboard, never type="number" (rule-limit.ts readLimitNumber): a comma or a dot both read.
  const field = (value: string, set: (v: string) => void, label: string, mode: "numeric" | "decimal") => (
    <input
      type="text"
      inputMode={mode}
      autoComplete="off"
      value={value}
      onChange={(e) => {
        setCapped(false)
        setUnreadable(false)
        set(e.target.value)
      }}
      // Hours → minutes is one value being typed: saved when focus leaves the PAIR, or the half-typed hours would
      // be saved and the saved value would wipe the minutes being typed.
      onBlur={(e) => !(duration && e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) && commit()}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label={label}
      aria-describedby={hintId}
      aria-invalid={unreadable || undefined}
      className={cn(LIMIT, duration ? "w-16" : "w-24", "text-center")}
    />
  )
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
        : range.from != null
          ? t("approvals.tree.range.over", { from: show(range.from) })
          : t("approvals.tree.range.all")

  return (
    <FlowNode
      icon="timeLine"
      label={t("approvals.tree.node.when")}
      value={value}
      bad={range.shadowedBy != null}
      readOnly={rule.editable === false}
      onClose={commit}
      sub={
        range.shadowedBy != null
          ? t("approvals.tree.range.twin", { n: range.shadowedBy })
          : rule.whenCoverShort
            ? t("approvals.tree.coverShort")
            : undefined
      }
    >
      {hasLimit && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">{t("approvals.tree.moreThan")}</span>
          {duration ? (
            <>
              {field(
                hm.h,
                (h) => setHm((v) => ({ ...v, h })),
                `${t("approvals.tree.moreThan")} · ${t("approvals.tree.unit.h")}`,
                "decimal",
              )}
              <span className="text-[13px] text-muted-foreground">{t("approvals.tree.unit.h")}</span>
              {field(
                hm.m,
                (m) => setHm((v) => ({ ...v, m })),
                `${t("approvals.tree.moreThan")} · ${t("approvals.tree.unit.min")}`,
                "numeric",
              )}
            </>
          ) : (
            field(limit, setLimit, t("approvals.tree.moreThan"), rule.kind === "expense" ? "decimal" : "numeric")
          )}
          {/* A duration's fields already say h and min: overtime needs nothing after them, changed hours only how. */}
          {rule.kind !== "overtime" && (
            <span className="text-[13px] text-muted-foreground">
              {rule.kind === "hours"
                ? t("approvals.tree.changedByHand")
                : t(`approvals.tree.unit.${rule.kind}`, { currency })}
            </span>
          )}
          <p
            id={hintId}
            aria-live="polite"
            className={cn("w-full text-[12px]", unreadable ? "text-destructive" : "text-muted-foreground")}
          >
            {hint}
          </p>
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
