"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { RULE_KINDS, type RuleKind } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useRulesTree } from "../../_hooks/use-rules-tree"
import { ruleRanges } from "../../_lib/rule-range"
import { RuleCard } from "./rule-card"
import { ChoiceSelect, DoneNode, Stem, TreeNode } from "./tree-nodes"

/** One column under the split: the joining line above it, then its boxes. */
const BRANCH =
  "relative flex w-[280px] shrink-0 flex-col items-center px-2.5 pt-5 " +
  "before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-[hsl(var(--muted-foreground)/0.35)] " +
  "first:before:left-1/2 last:before:right-1/2 " +
  "after:absolute after:left-1/2 after:top-0 after:h-5 after:w-0.5 after:bg-[hsl(var(--muted-foreground)/0.35)]"

const NEW_PILL =
  "inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-shell-accent px-4 text-sm font-semibold " +
  "text-shell-accent hover:bg-shell-accent-soft disabled:opacity-50"
const NEW_CARD =
  "mt-1 h-24 w-full rounded-2xl border-[1.5px] border-dashed border-shell-accent bg-card text-sm font-bold " +
  "text-shell-accent hover:bg-shell-accent-soft disabled:opacity-50"
const NO_RULE =
  "w-full rounded-2xl border border-border bg-card px-3 py-2.5 text-center text-[12.5px] font-semibold " +
  "text-muted-foreground shadow-shell"
const DOTS = {
  backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1.2px)",
  backgroundSize: "18px 18px",
}

function Branch({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(BRANCH, className)}>{children}</div>
}

/**
 * "Who approves": pick what needs approval, see who approves it first, then the office's rules for
 * it side by side — a second approval past a limit, a chase when nobody answers. The server decides
 * which rule applies (the workspace's own first, then the higher limit), so there is no order to set.
 */
export function RulesTree() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = user?.orgCurrency ?? "EUR"
  const tree = useRulesTree(true)
  const spaceName = (id: string) => tree.workspaces.find((w) => w.id === id)?.name ?? "?"
  const ranges = ruleRanges(tree.rules, spaceName)
  const catchesAll = tree.rules.some(
    (r) => r.isActive && !r.spaceId && !r.whenCoverShort && (r.minMinutes ?? r.minDays ?? r.minAmountCents) == null,
  )
  const kindName = (k: RuleKind) => t(`approvals.rules.kind.${k}`)
  const countOf = (k: RuleKind) => tree.counts.filter((r) => r.kind === k).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="mr-auto max-w-[640px] text-sm text-muted-foreground">{t("approvals.tree.intro")}</p>
        <button type="button" onClick={tree.add} disabled={tree.busy} className={NEW_PILL}>
          {t("approvals.tree.newRule")}
        </button>
      </div>

      <div
        className="flex flex-col items-center overflow-x-auto rounded-[22px] border border-border bg-shell-chip px-4 pb-6 pt-7"
        style={DOTS}
      >
        <TreeNode icon="arrowRight" className="border-[1.5px] border-foreground">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[12.5px] text-muted-foreground">{t("approvals.tree.what")}</span>
            <ChoiceSelect
              value={tree.kind}
              onChange={(v) => tree.setKind(v as RuleKind)}
              label={t("approvals.tree.what")}
              choices={RULE_KINDS.map((k) => ({
                value: k,
                label: countOf(k) ? `${kindName(k)} · ${countOf(k)}` : kindName(k),
              }))}
            />
          </div>
        </TreeNode>
        <Stem />
        <TreeNode icon="userLine">
          <div className="min-w-0">
            <b className="block text-sm">{t("approvals.tree.first")}</b>
            <span className="block text-[12.5px] text-muted-foreground">
              {t(`approvals.tree.firstBy.${tree.kind}`)}
            </span>
          </div>
        </TreeNode>
        <Stem />

        <div className="flex min-w-min items-start">
          {tree.isLoading ? (
            <Branch>
              <Skeleton className="h-64 w-full rounded-2xl" />
            </Branch>
          ) : (
            tree.rules.map((r, i) => (
              <Branch key={r.id}>
                <RuleCard
                  rule={r}
                  n={i + 1}
                  roles={tree.roles}
                  workspaces={tree.workspaces}
                  currency={currency}
                  range={ranges[i]}
                  onChange={(patch) => tree.change(r, patch)}
                  onRemove={() => tree.remove.mutate(r.id)}
                />
              </Branch>
            ))
          )}
          {/* Only when something can fall through: an active rule for every workspace with no limit catches it all. */}
          {!catchesAll && (
            <Branch>
              <div className={NO_RULE}>{t("approvals.tree.noRuleFits")}</div>
              <Stem />
              <DoneNode>{t("approvals.tree.doneFirst")}</DoneNode>
            </Branch>
          )}
          <Branch className="w-[170px]">
            <button type="button" onClick={tree.add} disabled={tree.busy} className={NEW_CARD}>
              {t("approvals.tree.newRule")}
            </button>
          </Branch>
        </div>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("approvals.tree.footnote")}</p>
    </div>
  )
}
