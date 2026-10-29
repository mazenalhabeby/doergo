"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { RULE_LIMITS, type ApprovalRuleView, type RuleFacts, type RuleKind } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import type { RuleRole } from "../../_hooks/use-rules-tree"
import { readLimitNumber } from "../../_lib/rule-limit"
import { tryNeeds } from "../../_lib/rule-view"
import { ChoiceSelect, NONE } from "./tree-nodes"

const CHIP = "rounded-full px-2.5 py-1 text-[12.5px] font-semibold"

/** The value typed, as the rule's fact: hours → minutes, money → cents, days as they are; null = nothing usable. */
function factOf(kind: RuleKind, typed: string): Partial<RuleFacts> | null {
  const spec = RULE_LIMITS[kind]
  if (!spec) return {}
  const n = readLimitNumber(typed, kind === "expense")
  if (n === "" || n == null) return null
  if (spec.fact === "minutes") return { minutes: Math.round(n * 60) }
  if (spec.fact === "amountCents") return { amountCents: Math.round(n * 100) }
  return { days: n }
}

/**
 * "Try an item": type what an item would be — its time, days or amount, and where — and see at once who must
 * approve it besides the usual approver. The same reading as the server (`tryNeeds`), over every rule of the kind;
 * nothing is saved and nothing is asked of the server. The rules that apply stay bright on the canvas
 * (`onMatch`); the others fade.
 */
export function TryItem({
  kind,
  rules,
  roles,
  workspaces,
  seen,
  currency,
  onMatch,
}: {
  kind: RuleKind
  rules: ApprovalRuleView[]
  roles: RuleRole[]
  workspaces: { id: string; name: string }[]
  /** The workspace the canvas is seen from; null = the whole company (the item's workspace is then chosen here). */
  seen: string | null
  currency: string
  onMatch: (matched: Set<string> | null) => void
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState("")
  const [flag, setFlag] = useState(false)
  const [categoryId, setCategoryId] = useState(NONE)
  const [pick, setPick] = useState<string | null>(null)
  const where = seen ?? pick ?? workspaces[0]?.id ?? null
  const spec = RULE_LIMITS[kind]
  // A fresh kind starts empty: an amount typed for expenses means nothing as overtime.
  useEffect(() => {
    setTyped("")
    setFlag(false)
    setCategoryId(NONE)
  }, [kind])

  const kinds = useMemo(
    () => [...new Map(rules.filter((r) => r.categoryId).map((r) => [r.categoryId!, r.categoryName ?? "—"])).entries()],
    [rules],
  )
  const result = useMemo(() => {
    const fact = factOf(kind, typed)
    if (!fact || !where) return null
    return tryNeeds(rules, {
      spaceIds: [where],
      ...fact,
      coverShort: kind === "request" ? flag : null,
      urgent: kind === "clientRequest" ? flag : null,
      categoryId: kind === "assetProposal" && categoryId !== NONE ? categoryId : null,
    })
  }, [kind, typed, where, flag, categoryId, rules])
  const unreadable = typed.trim() !== "" && factOf(kind, typed) == null
  useEffect(() => onMatch(result?.matched ?? null), [result, onMatch])
  useEffect(() => () => onMatch(null), [onMatch])

  const nameOf = (id: string) =>
    roles.find((r) => r.id === id)?.name ?? rules.find((r) => r.secondRoleId === id)?.secondRoleName ?? "—"
  const unit = !spec
    ? null
    : spec.fact === "minutes"
      ? t("approvals.tree.unit.h")
      : kind === "expense"
        ? t("approvals.tree.unit.expense", { currency })
        : t(`approvals.tree.unit.${kind}`)

  return (
    <section
      aria-label={t("approvals.tree.try.title")}
      className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b className="flex items-center gap-1.5">
          <Icon name="flash" size={15} />
          {t("approvals.tree.try.title")}
        </b>
        <span className="text-muted-foreground">{t(`approvals.rules.kind.${kind}`)}</span>
        {spec && (
          <>
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={`${t("approvals.tree.try.title")} · ${unit}`}
              aria-invalid={unreadable || undefined}
              className="h-9 w-24 text-center"
            />
            <span className="text-muted-foreground">{unit}</span>
          </>
        )}
        {kind === "assetProposal" && (
          <div className="w-48">
            <ChoiceSelect
              value={categoryId}
              onChange={setCategoryId}
              label={t("approvals.tree.assetKind")}
              choices={[
                { value: NONE, label: t("approvals.tree.try.otherKind") },
                ...kinds.map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        )}
        {(kind === "request" || kind === "clientRequest") && (
          <label className="flex items-center gap-2 text-muted-foreground">
            <Switch checked={flag} onCheckedChange={setFlag} className="scale-90" />
            {kind === "request" ? t("approvals.tree.try.coverShort") : t("approvals.tree.urgentOnly")}
          </label>
        )}
        {!seen && workspaces.length > 0 && (
          <>
            <span className="text-muted-foreground">{t("approvals.tree.try.in")}</span>
            <div className="w-48">
              <ChoiceSelect
                value={where ?? NONE}
                onChange={setPick}
                label={t("approvals.tree.try.in")}
                choices={workspaces.map((w) => ({ value: w.id, label: w.name }))}
              />
            </div>
          </>
        )}
      </div>
      {!result ? (
        <p className="text-[13px] text-muted-foreground">{t("approvals.tree.try.hint")}</p>
      ) : result.roleIds.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("approvals.tree.try.nobody")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">{t("approvals.tree.try.needs")}</span>
          {result.roleIds.map((id) => (
            <span key={id} className={cn(CHIP, "bg-shell-accent-soft text-shell-accent")}>
              {nameOf(id)}
            </span>
          ))}
          <span className="text-muted-foreground">
            {t("approvals.tree.try.people", { count: result.roleIds.length })} {t("approvals.tree.try.admin")}
          </span>
        </div>
      )}
    </section>
  )
}
