"use client"

import { AlertTriangle, ChevronLeft, Inbox, RefreshCw, ScrollText, UserRoundCheck } from "lucide-react"
import { APPROVAL_GROUPS, APPROVAL_KINDS, type ApprovalT, describeApproval } from "@hbcfield/shared/client"

import { dateLocale, formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { ListTableError } from "@/components/list-page"
import { DecisionPanel } from "./_components/decision-panel"
import { useApprovalsPage, itemKey } from "./use-approvals-page"
import { RulesDialog, StandInDialog, RailItem, Row } from "./approvals-page-helpers"

/**
 * Approvals — everything waiting for the member to decide, in one place.
 *
 * Thirteen kinds of decision lived on nine pages. The gateway reads each kind's
 * own list AS the caller (so it shows exactly what those pages show them) and
 * decides through each kind's own route; this page only arranges it: what
 * cannot wait first, then today, then the rest.
 */
export default function ApprovalsPage() {
  const {
    t,
    user,
    filter,
    setFilter,
    selected,
    setSelected,
    standInOpen,
    setStandInOpen,
    rulesOpen,
    setRulesOpen,
    managesPeople,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
    items,
    counts,
    visible,
    current,
    decide,
    onDecide,
    unavailable,
    covering,
  } = useApprovalsPage()

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
        <div
          className={"mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 " +
            "bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"}>
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
