"use client"

import dynamic from "next/dynamic"
import { AlertTriangle, ChevronLeft, Inbox, RefreshCw, UserRoundCheck } from "lucide-react"
import { APPROVAL_GROUPS, APPROVAL_KINDS, type ApprovalT, describeApproval } from "@hbcfield/shared/client"

import { dateLocale, formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { ListTableError } from "@/components/common/list-page"
import { GroupLabel, Notice, PageHeader, Panel } from "@/components/page/page-kit"
import { DecisionPanel } from "./_components/decision-panel"
import { useApprovalsPage, itemKey } from "./_hooks/use-approvals-page"
import { KindRailItem } from "./_components/kind-rail-item"
import { ApprovalRow } from "./_components/approval-row"
import { DayRow } from "./_components/day-row"
import { DayPanel } from "./_components/day-panel"

// Its own tab: never part of the inbox's first load.
const RulesTree = dynamic(() => import("./_components/rules-tree/rules-tree").then((m) => m.RulesTree), { ssr: false })

const StandInsTab = dynamic(() => import("./_components/stand-ins-tab").then((m) => m.StandInsTab), { ssr: false })

/**
 * Approvals — everything waiting for the member to decide, in one place.
 *
 * Thirteen kinds of decision lived on nine pages. The gateway reads each kind's
 * own list AS the caller (so it shows exactly what those pages show them) and
 * decides through each kind's own route; this page only arranges it: what
 * cannot wait first, then today, then the rest.
 */
/** The rail and the decision stay in view while the list scrolls; a column taller than the screen scrolls inside. */
const STICKY_COLUMN = "lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto"

export default function ApprovalsPage() {
  const {
    t,
    user,
    filter,
    setFilter,
    selected,
    setSelected,
    tab,
    setTab,
    managesRules,
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
    currentDay,
    visibleDays,
    membersOf,
    approveDay,
  } = useApprovalsPage()
  // An external member never hands their decisions on (the server refuses STAND_IN_EXTERNAL).
  const tabs = (["decide", "rules", "stand"] as const).filter(
    (k) => k === "decide" || (k === "rules" ? managesRules : !user?.isExternal),
  )

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        tour="page-approvals"
        title={t("approvals.title")}
        subtitle={t("approvals.subtitle")}
        actions={
          <>
            {dataUpdatedAt > 0 && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {t("approvals.updated", { time: formatTimeAgo(dataUpdatedAt) })}
              </span>
            )}
            <Button
              variant="outline"
              size="pillIcon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label={t("approvals.refresh")}
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} />
            </Button>
          </>
        }
      />

      {covering.length > 0 && (
        <Notice>
          <UserRoundCheck />
          {t("approvals.standIn.covering", { names: covering.join(", ") })}
        </Notice>
      )}

      {unavailable.length > 0 && (
        <Notice tone="warn">
          <AlertTriangle />
          {t("approvals.unavailable", { kinds: unavailable.map((k) => t(`approvals.kinds.${k}`)).join(", ") })}
        </Notice>
      )}

      {tabs.length > 1 && (
        <div role="tablist" aria-label={t("approvals.title")} className="mb-4 flex gap-1 border-b border-border">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "-mb-px h-11 border-b-2 px-3 text-sm font-semibold transition-colors",
                tab === k
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`approvals.tree.tab.${k}`)}
            </button>
          ))}
        </div>
      )}

      {tab === "rules" && managesRules ? (
        <RulesTree />
      ) : tab === "stand" && !user?.isExternal ? (
        <StandInsTab />
      ) : isError ? (
        <ListTableError title={t("approvals.loadFailed")} error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(320px,400px)]">
          {/* Kinds — only the ones that have something, so the rail is itself a summary. */}
          <Panel
            as="nav"
            className={cn(
              "flex gap-0.5 overflow-x-auto max-lg:rounded-2xl lg:flex-col",
              STICKY_COLUMN,
              current && "max-lg:hidden",
            )}
          >
            <KindRailItem
              active={filter === "all"}
              label={t("approvals.all")}
              count={items.length}
              urgent={items.some((i) => i.group === "NOW")}
              onClick={() => setFilter("all")}
            />
            {APPROVAL_KINDS.filter((k) => counts.has(k)).map((k) => (
              <KindRailItem
                key={k}
                active={filter === k}
                label={t(`approvals.kinds.${k}`)}
                count={counts.get(k) ?? 0}
                urgent={items.some((i) => i.kind === k && i.group === "NOW")}
                onClick={() => setFilter(k)}
              />
            ))}
          </Panel>

          <Panel className={cn((current || currentDay) && "max-lg:hidden")}>
            {isLoading ? (
              <div className="space-y-2 p-1">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-[14px]" />
                ))}
              </div>
            ) : visible.length === 0 && visibleDays.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Inbox className="mx-auto mb-3 size-10 text-muted-foreground/60" />
                <p className="font-medium text-foreground">{t("approvals.empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("approvals.emptyHint")}</p>
              </div>
            ) : (
              APPROVAL_GROUPS.map((g) => {
                const rows = visible.filter((i) => i.group === g)
                const dayRows = visibleDays.filter((d) => d.group === g)
                if (rows.length === 0 && dayRows.length === 0) return null
                return (
                  <div key={g}>
                    <GroupLabel tone={g === "NOW" ? "crit" : "soft"}>
                      {t(`approvals.groups.${g}`)}
                      <span className="font-normal tabular-nums">{rows.length + dayRows.length}</span>
                    </GroupLabel>
                    <ul>
                      {dayRows.map((d) => (
                        <DayRow key={d.key} day={d} active={d.key === selected} onSelect={() => setSelected(d.key)} />
                      ))}
                      {rows.map((i) => (
                        <ApprovalRow
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
              })
            )}
          </Panel>

          <aside className={cn("min-w-0 rounded-[22px]", STICKY_COLUMN, !current && !currentDay && "max-lg:hidden")}>
            <div>
              {currentDay ? (
                <Panel className="p-5">
                  <DayPanel
                    day={currentDay}
                    members={membersOf(currentDay)}
                    busy={approveDay.isPending}
                    onApprove={() => approveDay.mutate(currentDay)}
                    onReview={(i) => {
                      setFilter("all")
                      setSelected(`${i.kind}:${i.id}`)
                    }}
                    orgCurrency={user?.orgCurrency}
                  />
                </Panel>
              ) : current ? (
                <Panel className="p-5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 mb-3 rounded-full lg:hidden"
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
                    onMakeRule={
                      managesRules
                        ? (link) => {
                            window.history.replaceState(null, "", link)
                            setTab("rules")
                          }
                        : undefined
                    }
                  />
                </Panel>
              ) : (
                !isLoading &&
                visible.length > 0 && (
                  <p className="rounded-[22px] border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                    {t("approvals.pick")}
                  </p>
                )
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
