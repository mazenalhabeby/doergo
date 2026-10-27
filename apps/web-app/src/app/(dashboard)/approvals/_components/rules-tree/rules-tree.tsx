"use client"

import { useTranslation } from "react-i18next"
import { RULE_KINDS, type RuleKind } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { ListTableError } from "@/components/common/list-page"
import { Panel, RAIL_ROW } from "@/components/page/page-kit"
import { cn } from "@/lib/utils"
import { useRulesTree } from "../../_hooks/use-rules-tree"
import { fallThrough, ruleRanges } from "../../_lib/rule-range"
import { limitText } from "../../_lib/rule-limit"
import { RulesCanvas } from "./rules-canvas"
import { UncaughtNode } from "./uncaught-node"
import { SuggestionBar } from "./suggestion-bar"
import { useRuleOffers } from "../../_hooks/use-rule-offers"

const NEW_NODE =
  "inline-flex h-11 items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-shell-accent bg-card px-4 " +
  "text-sm font-semibold text-shell-accent hover:bg-shell-accent-soft disabled:opacity-50"
const START = "flex w-[230px] flex-col gap-1.5 rounded-2xl border-[1.5px] border-foreground bg-card p-4 shadow-shell"
/**
 * "Who approves": what needs approval in a sidebar (with what already has rules), and the chosen kind on a
 * node canvas like n8n — the start on the left, one chain per rule fanning out: where → when (its real
 * range) → also approves → no answer → done. A node says one thing; clicking it opens its editor; every
 * change saves at once and the server checks and enforces it.
 */
export function RulesTree() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = user?.orgCurrency ?? "EUR"
  const tree = useRulesTree(true)
  const spaceName = (id: string) => tree.workspaces.find((w) => w.id === id)?.name ?? "?"
  const ranges = ruleRanges(tree.rules)
  const uncaught = fallThrough(tree.rules, tree.workspaces)
  const kindName = (k: RuleKind) => t(`approvals.rules.kind.${k}`)
  const countOf = (k: RuleKind) => tree.counts.filter((r) => r.kind === k).length
  const showLimit = (v: number) => limitText(t, tree.kind, v, currency)
  const { offers, dismiss } = useRuleOffers({
    kind: tree.kind,
    setKind: tree.setKind,
    insights: tree.insights,
    spaceName,
    limitText: showLimit,
  })

  const start = (
    <div className={START}>
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <Icon name="flash" size={14} />
        {t("approvals.tree.startLabel")}
      </span>
      <b className="text-[16px] leading-snug">{kindName(tree.kind)}</b>
      <span className="text-[12px] leading-snug text-muted-foreground">
        {t("approvals.tree.first")}: {t(`approvals.tree.firstBy.${tree.kind}`)}
      </span>
    </div>
  )
  const fallsThrough = uncaught.length ? (
    <UncaughtNode
      items={uncaught}
      limitText={showLimit}
      busy={tree.busy}
      everywhere={tree.everywhere}
      onAdd={(spaceId) => void tree.add({ spaceId }).catch(() => {})}
    />
  ) : null
  const add = (
    <button type="button" onClick={() => void tree.add().catch(() => {})} disabled={tree.busy} className={NEW_NODE}>
      <Icon name="plus" size={16} />
      {t("approvals.tree.newRule")}
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[720px] text-sm text-muted-foreground">{t("approvals.tree.intro")}</p>
      <SuggestionBar
        insights={tree.insights?.kind === tree.kind ? tree.insights : undefined}
        kindLabel={kindName(tree.kind)}
        offers={offers}
        busy={tree.busy}
        approver={tree.defaultRole?.name}
        // Gone once it is really added — a failed save leaves the offer to try again.
        onAdd={(o) => void tree.add({ spaceId: o.spaceId, limit: o.limit }).then(() => dismiss(o), () => {})}
        onDismiss={dismiss}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <Panel as="nav" className="flex flex-col gap-0.5">
          <span className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t("approvals.tree.what")}
          </span>
          {RULE_KINDS.map((k) => {
            const n = countOf(k)
            return (
              <button
                key={k}
                type="button"
                aria-current={tree.kind === k}
                onClick={() => tree.setKind(k)}
                className={cn(RAIL_ROW, "h-auto items-start py-2.5")}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{kindName(k)}</span>
                  <span className={cn("text-xs font-normal", n ? "text-shell-accent" : "text-muted-foreground")}>
                    {n ? t("approvals.tree.ruleCount", { count: n }) : t("approvals.tree.noRules")}
                  </span>
                </span>
              </button>
            )
          })}
        </Panel>
        {tree.isError ? (
          <ListTableError title={t("approvals.tree.loadFailed")} error={tree.error} onRetry={() => tree.refetch()} />
        ) : tree.isLoading ? (
          <Skeleton className="h-[420px] w-full rounded-[22px]" />
        ) : (
          <RulesCanvas
            kind={tree.kind}
            start={start}
            uncaught={fallsThrough}
            add={add}
            ctx={{
              rules: tree.rules,
              ranges,
              roles: tree.roles,
              workspaces: tree.workspaces,
              currency,
              onChange: tree.change,
              onRemove: (r) => tree.remove.mutate(r.id),
              hits: tree.insights?.kind === tree.kind ? tree.insights.perRule : undefined,
              everywhere: tree.everywhere,
            }}
          />
        )}
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("approvals.tree.footnote")}</p>
    </div>
  )
}
