"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { RULE_KINDS, type RuleKind } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { useRulesTree } from "../../_hooks/use-rules-tree"
import { fallThrough, ruleRanges } from "../../_lib/rule-range"
import { RuleRow, limitText } from "./rule-row"
import { ChoiceSelect, Connector, DoneNode } from "./tree-nodes"

const DOTS = {
  backgroundImage: "radial-gradient(hsl(var(--muted-foreground) / 0.18) 1px, transparent 1.2px)",
  backgroundSize: "20px 20px",
}
const UNCAUGHT =
  "flex w-[396px] shrink-0 flex-col gap-0.5 rounded-2xl border border-dashed border-border bg-card px-3.5 py-2.5 " +
  "shadow-shell"
const LINE = "bg-[hsl(var(--muted-foreground)/0.35)]"
const NEW_NODE =
  "inline-flex h-11 items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-shell-accent bg-card px-4 " +
  "text-sm font-semibold text-shell-accent hover:bg-shell-accent-soft disabled:opacity-50"
const START =
  "flex w-[226px] shrink-0 flex-col gap-2 rounded-2xl border-[1.5px] border-foreground bg-card p-3.5 shadow-shell"

/** One branch off the start node: the stub joining it to the trunk, then its chain. */
function Branch({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex items-end py-2 pl-10">
      <span aria-hidden className={`absolute bottom-[38px] left-0 h-0.5 w-10 ${LINE}`} />
      {children}
    </div>
  )
}

/**
 * "Who approves", laid out like a node canvas (n8n, Freepik Spaces): what needs approval on the left, one
 * chain per rule fanning out to the right — where → when → who also approves → if nobody answers → done.
 * Each node says one thing; clicking it opens its editor. Every change saves at once (the server checks
 * and enforces it). Which rule applies is the server's choice: the workspace's own first, then the higher
 * limit — each "When" node shows the range that results.
 */
export function RulesTree() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = user?.orgCurrency ?? "EUR"
  const tree = useRulesTree(true)
  const spaceName = (id: string) => tree.workspaces.find((w) => w.id === id)?.name ?? "?"
  const ranges = ruleRanges(tree.rules, spaceName)
  const uncaught = fallThrough(tree.rules, tree.workspaces).map((f) =>
    f.upTo == null
      ? f.name
      : t("approvals.tree.upToIn", { name: f.name, to: limitText(t, tree.kind, f.upTo, currency) }),
  )
  const moreText = t("approvals.tree.more", { count: uncaught.length - 4 })
  const kindName = (k: RuleKind) => t(`approvals.rules.kind.${k}`)
  const countOf = (k: RuleKind) => tree.counts.filter((r) => r.kind === k).length

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[720px] text-sm text-muted-foreground">{t("approvals.tree.intro")}</p>

      <div className="overflow-x-auto rounded-[22px] border border-border bg-shell-chip p-6" style={DOTS}>
        <div className="flex min-w-min items-center">
          <div className={START}>
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              <Icon name="flash" size={14} />
              {t("approvals.tree.what")}
            </span>
            <ChoiceSelect
              value={tree.kind}
              onChange={(v) => tree.setKind(v as RuleKind)}
              label={t("approvals.tree.what")}
              choices={RULE_KINDS.map((k) => ({
                value: k,
                label: countOf(k) ? `${kindName(k)} · ${countOf(k)}` : kindName(k),
              }))}
            />
            <span className="text-[12px] leading-snug text-muted-foreground">
              {t("approvals.tree.first")}: {t(`approvals.tree.firstBy.${tree.kind}`)}
            </span>
          </div>
          <Connector />

          {/* The trunk: one line down the left of the branches. */}
          <div className="relative flex flex-col">
            <span aria-hidden className={`absolute bottom-[38px] left-0 top-[66px] w-0.5 ${LINE}`} />
            {tree.isLoading ? (
              <Branch>
                <Skeleton className="h-20 w-[880px] rounded-2xl" />
              </Branch>
            ) : (
              tree.rules.map((r, i) => (
                <Branch key={r.id}>
                  <RuleRow
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
            {/* Only when something can fall through — and it says exactly what does. */}
            {uncaught.length > 0 && (
              <Branch>
                <div className={UNCAUGHT}>
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                    {t("approvals.tree.noRuleFits")}
                  </span>
                  <span className="text-[13.5px] font-semibold leading-snug">
                    {uncaught.slice(0, 4).join(" · ")}
                    {uncaught.length > 4 && <> {moreText}</>}
                  </span>
                </div>
                <Connector />
                <DoneNode>{t("approvals.tree.doneOne")}</DoneNode>
              </Branch>
            )}
            <Branch>
              <button type="button" onClick={tree.add} disabled={tree.busy} className={NEW_NODE}>
                <Icon name="plus" size={16} />
                {t("approvals.tree.newRule")}
              </button>
            </Branch>
          </div>
        </div>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("approvals.tree.footnote")}</p>
    </div>
  )
}
