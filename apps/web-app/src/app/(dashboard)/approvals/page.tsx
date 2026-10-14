"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { AlertTriangle, ChevronLeft, Inbox, RefreshCw, ScrollText, UserRoundCheck } from "lucide-react"
import {
  APPROVAL_GROUPS,
  APPROVAL_KINDS,
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalsResponse,
  type ApprovalT,
  describeApproval,
} from "@hbcfield/shared/client"

import { approvalsApi } from "@/lib/api"
import { keys, invalidateTimeOff } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { dateLocale, formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { ListTableError } from "@/components/list-page"
import { UserAvatar } from "@/components/user-avatar"
import { DecisionPanel } from "./_components/decision-panel"

// Opened by a button: never part of the first load.
const RulesDialog = dynamic(() => import("./_components/rules-dialog").then((m) => m.RulesDialog), { ssr: false })
const StandInDialog = dynamic(() => import("./_components/stand-in-dialog").then((m) => m.StandInDialog), { ssr: false })
import { nameParts } from "./_components/name-parts"

type Filter = ApprovalKind | "all"

/** The kind's own screen reads these — refreshed after a decision made here. */
const KIND_KEYS: Partial<Record<ApprovalKind, QueryKey[]>> = {
  hours: [keys.attendance.approvals(), keys.attendance.pendingApprovals()],
  away: [keys.attendance.excursions()],
  extraTime: [keys.overtime.pending()],
  overtime: [keys.overtime.pending()],
  noShow: [keys.attendance.noShows()],
  issue: [keys.shiftIssues.list()],
  expense: [keys.assets.expensesPending()],
  assetProposal: [keys.assets.proposalsPending()],
  document: [keys.documents.awaitingVerification()],
  join: [keys.people.joinRequests()],
  clientRequest: [keys.portal.allRequests()],
}

const itemKey = (i: Pick<ApprovalItem, "kind" | "id">) => `${i.kind}:${i.id}`

/**
 * Approvals — everything waiting for the member to decide, in one place.
 *
 * Thirteen kinds of decision lived on nine pages. The gateway reads each kind's
 * own list AS the caller (so it shows exactly what those pages show them) and
 * decides through each kind's own route; this page only arranges it: what
 * cannot wait first, then today, then the rest.
 */
export default function ApprovalsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>("all")
  const [selected, setSelected] = useState<string | null>(null)
  // Arriving from a page's "decide in Approvals" line: open on that kind.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const kind = q.get("kind")
    if (kind && (APPROVAL_KINDS as readonly string[]).includes(kind)) {
      setFilter(kind as Filter)
      // One item asked for by name (a page's "Decide in Approvals"): open it.
      const id = q.get("id")
      if (id) setSelected(`${kind}:${id}`)
    }
  }, [])
  const [standInOpen, setStandInOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  // Office rules are the organization's own policy: people managers only (the server checks the same).
  const { holds } = useRouteAccess()
  const managesPeople = holds("org:canManageUsers")

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: keys.approvals.list(),
    queryFn: approvalsApi.list,
    staleTime: 15_000,
  })

  const items = useMemo(() => data?.items ?? [], [data])
  const counts = useMemo(() => {
    const c = new Map<ApprovalKind, number>()
    for (const i of items) c.set(i.kind, (c.get(i.kind) ?? 0) + 1)
    return c
  }, [items])
  const visible = useMemo(() => (filter === "all" ? items : items.filter((i) => i.kind === filter)), [items, filter])

  // The first item is chosen for you on a wide screen; a narrow one starts on the list.
  const current = visible.find((i) => itemKey(i) === selected) ?? null
  useEffect(() => {
    if (current || visible.length === 0) return
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setSelected(itemKey(visible[0]!))
  }, [current, visible])

  // ↑ / ↓ walk the list — a queue is worked through, not clicked through.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const at = visible.findIndex((i) => itemKey(i) === selected)
      const next = visible[Math.min(visible.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]
      if (next) {
        e.preventDefault()
        setSelected(itemKey(next))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible, selected])

  const decide = useMutation({
    mutationFn: (d: ApprovalDecision) => approvalsApi.decide(d),
    onSuccess: (res, d) => {
      const done = items.find((i) => i.kind === d.kind && i.id === d.id)
      if (res.stage === "FIRST_STEP") {
        // Step 1 of 2: theirs is in; the item stays, now waiting for the second person.
        notify.success(t("approvals.step.firstDone", { role: res.waitingFor ?? "" }))
        qc.invalidateQueries({ queryKey: keys.approvals.all() })
        return
      }
      // Next in line BEFORE the list drops it, so the panel moves on instead of emptying.
      const at = visible.findIndex((i) => i.kind === d.kind && i.id === d.id)
      const next = visible[at + 1] ?? visible[at - 1]
      setSelected(next ? itemKey(next) : null)
      qc.setQueryData<ApprovalsResponse>(keys.approvals.list(), (old) =>
        old ? { ...old, items: old.items.filter((i) => !(i.kind === d.kind && i.id === d.id)) } : old,
      )
      notify.success(t("approvals.decided", { name: done?.subject.name || t("approvals.someone") }))
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
      for (const k of KIND_KEYS[d.kind] ?? []) qc.invalidateQueries({ queryKey: k })
      if (d.kind === "request") invalidateTimeOff(qc)
      if (d.kind === "guestRequest" && done?.space) qc.invalidateQueries({ queryKey: keys.spaces.shareRequests(done.space.id) })
    },
    onError: (e: Error) => {
      notify.error(e.message)
      // Somebody else may have decided it first — read the truth again.
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
    },
  })

  const onDecide = useCallback((d: ApprovalDecision) => decide.mutate(d), [decide])
  const unavailable = data?.unavailable ?? []
  // Whose decisions the reader covers today — said once, above the list.
  const covering = useMemo(
    () => [...new Set(items.filter((i) => i.why?.via === "DELEGATED" && i.why.fromName).map((i) => i.why!.fromName!))],
    [items],
  )

  return (
    <div className={PAGE_SHELL}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 data-tour="page-approvals" className="text-3xl font-bold tracking-tight text-foreground">{t("approvals.title")}</h1>
          <p className="mt-1.5 text-muted-foreground">{t("approvals.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t("approvals.updated", { time: formatTimeAgo(dataUpdatedAt) })}
            </span>
          )}
          {managesPeople && (
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => setRulesOpen(true)}>
              <ScrollText className="size-4" />
              {t("approvals.rules.open")}
            </Button>
          )}
          {/* An external member never hands their decisions on (the server refuses STAND_IN_EXTERNAL). */}
          {!user?.isExternal && (
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => setStandInOpen(true)}>
              <UserRoundCheck className="size-4" />
              {t("approvals.standIn.open")}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={t("approvals.refresh")}
            className="h-10 w-10 rounded-xl"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {covering.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
          <UserRoundCheck className="size-4 shrink-0 text-primary" />
          {t("approvals.standIn.covering", { names: covering.join(", ") })}
        </div>
      )}

      {unavailable.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0" />
          {t("approvals.unavailable", { kinds: unavailable.map((k) => t(`approvals.kinds.${k}`)).join(", ") })}
        </div>
      )}

      {isError ? (
        <ListTableError title={t("approvals.loadFailed")} error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)_minmax(320px,400px)]">
          {/* Kinds — only the ones that have something, so the rail is itself a summary. */}
          <nav
            aria-label={t("approvals.title")}
            className={cn("flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible", current && "max-lg:hidden")}
          >
            <RailItem active={filter === "all"} label={t("approvals.all")} count={items.length} onClick={() => setFilter("all")} />
            {APPROVAL_KINDS.filter((k) => counts.has(k)).map((k) => (
              <RailItem
                key={k}
                active={filter === k}
                label={t(`approvals.kinds.${k}`)}
                count={counts.get(k) ?? 0}
                urgent={items.some((i) => i.kind === k && i.group === "NOW")}
                onClick={() => setFilter(k)}
              />
            ))}
          </nav>

          <section className={cn("min-w-0", current && "max-lg:hidden")}>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
                <Inbox className="mx-auto mb-3 size-10 text-muted-foreground/60" />
                <p className="font-medium text-foreground">{t("approvals.empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("approvals.emptyHint")}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {APPROVAL_GROUPS.map((g) => {
                  const rows = visible.filter((i) => i.group === g)
                  if (rows.length === 0) return null
                  return (
                    <div key={g}>
                      <h2
                        className={cn(
                          "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide",
                          g === "NOW" ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                        )}
                      >
                        {g === "NOW" && <span className="size-1.5 rounded-full bg-red-600" aria-hidden />}
                        {t(`approvals.groups.${g}`)}
                        <span className="tabular-nums font-normal">{rows.length}</span>
                      </h2>
                      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                        {rows.map((i) => (
                          <Row
                            key={itemKey(i)}
                            item={i}
                            active={itemKey(i) === selected}
                            onSelect={() => setSelected(itemKey(i))}
                            orgCurrency={user?.orgCurrency}
                          />
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <aside className={cn("min-w-0", !current && "max-lg:hidden")}>
            <div className="lg:sticky lg:top-28">
              {current ? (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 mb-3 rounded-lg lg:hidden"
                    onClick={() => setSelected(null)}
                  >
                    <ChevronLeft className="size-4" />
                    {t("approvals.back")}
                  </Button>
                  <DecisionPanel
                    item={current}
                    text={describeApproval(current, t as ApprovalT, dateLocale(), user?.orgCurrency)}
                    busy={decide.isPending}
                    onDecide={onDecide}
                  />
                </div>
              ) : (
                !isLoading && visible.length > 0 && (
                  <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                    {t("approvals.pick")}
                  </p>
                )
              )}
            </div>
          </aside>
        </div>
      )}
      {standInOpen && <StandInDialog open={standInOpen} onOpenChange={setStandInOpen} />}
      {rulesOpen && <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />}
    </div>
  )
}

function RailItem({
  active,
  label,
  count,
  urgent,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  urgent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
          urgent ? "bg-red-600 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  )
}

function Row({
  item,
  active,
  onSelect,
  orgCurrency,
}: {
  item: ApprovalItem
  active: boolean
  onSelect: () => void
  orgCurrency?: string | null
}) {
  const { t } = useTranslation()
  const text = describeApproval(item, t as ApprovalT, dateLocale(), orgCurrency)
  const lead = text.facts[0]
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <UserAvatar {...nameParts(item.subject.name)} avatarUrl={item.subject.avatarUrl} seed={item.subject.id ?? item.subject.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium text-foreground">{item.subject.name || t("approvals.someone")}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{t(`approvals.kinds.${item.kind}`)}</span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {text.headline}
            {lead ? ` · ${lead.value}` : ""}
            {item.space ? ` · ${item.space.name}` : ""}
            {item.step ? ` · ${t("approvals.step.short", { role: item.step.roleName })}` : ""}
          </p>
        </div>
        {item.raisedAt && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTimeAgo(item.raisedAt)}</span>
        )}
      </button>
    </li>
  )
}
