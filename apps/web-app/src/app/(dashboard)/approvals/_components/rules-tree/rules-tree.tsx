"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { RULE_KINDS, type ApprovalRuleInput, type ApprovalRuleView, type RuleKind } from "@hbcfield/shared/client"
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
import { seenRules } from "../../_lib/rule-view"
import { ChoiceSelect, NONE } from "./tree-nodes"
import { TryItem } from "./try-item"

const NEW_NODE =
  "inline-flex h-11 items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-shell-accent bg-card px-4 " +
  "text-sm font-semibold text-shell-accent hover:bg-shell-accent-soft disabled:opacity-50"
const START = "flex w-[230px] flex-col gap-1.5 rounded-2xl border-[1.5px] border-foreground bg-card p-4 shadow-shell"
/**
 * "Who approves": what needs approval in a sidebar (with what already has rules), and the chosen kind on a
 * node canvas like n8n — the start on the left, one chain per rule fanning out: where → when (its real
 * range) → also approves → no answer → done. A node says one thing; clicking it opens its editor; every
 * change saves at once and the server checks and enforces it.
 *
 * "Seen from": the whole company (every rule), or ONE workspace — the company's rules (shown, locked, marked
 * "from the company") and that workspace's own: exactly what an item there meets. "Try an item" below says who
 * must approve one, with the server's own reading, and fades the rules it does not meet.
 */
export function RulesTree() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currency = user?.orgCurrency ?? "EUR"
  const tree = useRulesTree(true)
  // A manager of some workspaces only has no "whole company": the page opens on their first one.
  const [picked, setPicked] = useState<string | null>(null)
  const seen = picked ?? (tree.everywhere ? null : (tree.workspaces[0]?.id ?? null))
  const shown = useMemo(() => seenRules(tree.rules, seen), [tree.rules, seen])
  const [matched, setMatched] = useState<Set<string> | null>(null)
  // A workspace no longer listed (archived) keeps the name its rule carries.
  const spaceName = (id: string) =>
    tree.workspaces.find((w) => w.id === id)?.name ?? tree.rules.find((r) => r.spaceId === id)?.spaceName ?? "—"
  const ranges = useMemo(() => ruleRanges(shown), [shown])
  const uncaught = useMemo(
    () => fallThrough(shown, seen ? tree.workspaces.filter((w) => w.id === seen) : tree.workspaces),
    [shown, seen, tree.workspaces],
  )
  /*
    The callbacks reach the LATEST tree through a ref, so they never change: the context below changes only
    with what the nodes show (the rules, their ranges, the roles …) — not on every render of this page.
  */
  const latest = useRef(tree)
  latest.current = tree
  const onChange = useCallback(
    (r: ApprovalRuleView, patch: Partial<ApprovalRuleInput>) => latest.current.change(r, patch),
    [],
  )
  const onRemove = useCallback((r: ApprovalRuleView) => latest.current.remove.mutate(r.id), [])
  const onAddAt = useCallback((spaceId?: string | null) => void latest.current.add({ spaceId }).catch(() => {}), [])
  const hits = tree.insights?.kind === tree.kind ? tree.insights.perRule : undefined
  const ctx = useMemo(
    () => ({
      rules: shown,
      ranges,
      roles: tree.roles,
      workspaces: tree.workspaces,
      currency,
      onChange,
      onRemove,
      hits,
      everywhere: tree.everywhere,
      removing: tree.removing,
      seen,
      matched,
    }),
    [
      shown,
      ranges,
      tree.roles,
      tree.workspaces,
      currency,
      onChange,
      onRemove,
      hits,
      tree.everywhere,
      tree.removing,
      seen,
      matched,
    ],
  )
  const kindName = (k: RuleKind) => t(`approvals.rules.kind.${k}`)
  const countOf = (k: RuleKind) => tree.counts.filter((r) => r.kind === k).length
  const showLimit = useCallback((v: number) => limitText(t, tree.kind, v, currency), [t, tree.kind, currency])
  const { everywhere, workspaces } = tree
  const mayOffer = useCallback(
    (spaceId: string | null) => everywhere || (!!spaceId && workspaces.some((w) => w.id === spaceId)),
    [everywhere, workspaces],
  )
  const { offers, dismiss, notYours, dismissNotYours } = useRuleOffers({
    kind: tree.kind,
    setKind: tree.setKind,
    insights: tree.insights,
    spaceName,
    limitText: showLimit,
    mayOffer,
    ready: tree.workspacesKnown,
  })

  // The canvas's three boxes, each made again only when what it shows changes.
  const busy = tree.busy || !tree.canAdd
  const start = useMemo(
    () => (
      <div className={START}>
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          <Icon name="flash" size={14} />
          {t("approvals.tree.startLabel")}
        </span>
        <b className="text-[16px] leading-snug">{t(`approvals.rules.kind.${tree.kind}`)}</b>
        <span className="text-[12px] leading-snug text-muted-foreground">
          {t("approvals.tree.first")}: {t(`approvals.tree.firstBy.${tree.kind}`)}
        </span>
      </div>
    ),
    [t, tree.kind],
  )
  const fallsThrough = useMemo(
    () =>
      uncaught.length ? (
        <UncaughtNode items={uncaught} limitText={showLimit} busy={busy} everywhere={tree.everywhere} onAdd={onAddAt} />
      ) : null,
    [uncaught, showLimit, busy, tree.everywhere, onAddAt],
  )
  const add = useMemo(
    () => (
      <button type="button" onClick={() => onAddAt(seen)} disabled={busy} className={NEW_NODE}>
        <Icon name="plus" size={16} />
        {t("approvals.tree.newRule")}
      </button>
    ),
    [busy, onAddAt, seen, t],
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[720px] text-sm text-muted-foreground">{t("approvals.tree.intro")}</p>
      {notYours && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Icon name="alertLine" size={15} />
          {notYours}
          <button
            type="button"
            onClick={dismissNotYours}
            aria-label={t("approvals.tree.smart.notNow")}
            className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-accent"
          >
            <Icon name="closeLine" size={14} />
          </button>
        </p>
      )}
      <SuggestionBar
        insights={tree.insights?.kind === tree.kind ? tree.insights : undefined}
        kindLabel={kindName(tree.kind)}
        offers={offers}
        busy={tree.busy || !tree.canAdd}
        approver={tree.defaultRole?.name}
        // Gone once it is really added — a failed save leaves the offer to try again.
        onAdd={(o) =>
          void tree.add({ spaceId: o.spaceId, limit: o.limit }).then(
            () => dismiss(o),
            () => {},
          )
        }
        onDismiss={dismiss}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* Below lg a compact strip that scrolls sideways, so the canvas is not pushed under a column of kinds. */}
        <Panel
          as="nav"
          aria-label={t("approvals.tree.what")}
          className="flex gap-0.5 overflow-x-auto max-lg:rounded-2xl lg:flex-col"
        >
          <span className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground max-lg:hidden">
            {t("approvals.tree.what")}
          </span>
          {RULE_KINDS.map((k) => {
            const n = countOf(k)
            return (
              <button
                key={k}
                type="button"
                aria-current={tree.kind === k ? "true" : undefined}
                onClick={() => tree.setKind(k)}
                className={cn(RAIL_ROW, "h-auto items-start py-2.5 max-lg:w-auto max-lg:max-w-[180px]")}
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
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {t("approvals.tree.seenFrom")}
              </span>
              <div className="w-56">
                <ChoiceSelect
                  value={seen ?? NONE}
                  onChange={(v) => setPicked(v === NONE ? null : v)}
                  label={t("approvals.tree.seenFrom")}
                  choices={[
                    ...(tree.everywhere ? [{ value: NONE, label: t("approvals.tree.wholeCompany") }] : []),
                    ...tree.workspaces.map((w) => ({ value: w.id, label: w.name })),
                  ]}
                />
              </div>
              {seen && (
                <span className="text-[12.5px] text-muted-foreground">
                  {t("approvals.tree.seenHint", { place: spaceName(seen) })}
                </span>
              )}
            </div>
            <RulesCanvas kind={tree.kind} start={start} uncaught={fallsThrough} add={add} ctx={ctx} />
            <TryItem
              kind={tree.kind}
              rules={tree.rules}
              roles={tree.roles}
              workspaces={tree.workspaces}
              seen={seen}
              currency={currency}
              onMatch={setMatched}
            />
          </div>
        )}
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("approvals.tree.footnote")}</p>
    </div>
  )
}
