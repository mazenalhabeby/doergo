"use client"

import dynamic from "next/dynamic"
import { APPROVAL_GROUPS, APPROVAL_KINDS, WAITS_FOR_YOU_FILTER } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { ListTableError } from "@/components/common/list-page"
import { GroupLabel, PageHeader, Panel } from "@/components/page/page-kit"
import { DecisionPanel } from "./_components/decision-panel"
import { useApprovalsPage, itemKey } from "./_hooks/use-approvals-page"
import { KindRailItem } from "./_components/kind-rail-item"
import { ApprovalRow } from "./_components/approval-row"
import { DayRow } from "./_components/day-row"
import { DayPanel } from "./_components/day-panel"
import { InboxActions } from "./_components/inbox-actions"
import { InboxEmpty } from "./_components/inbox-empty"
import { InboxNotices } from "./_components/inbox-notices"
import { BackButton } from "./_components/back-button"
import { tabKeyTarget } from "./_lib/tab-keys"
import { describeItem } from "./_lib/describe"

// Its own tab: never part of the inbox's first load; the tab's own shape while its code arrives, never a blank panel.
const TabLoading = () => <Skeleton className="h-[420px] w-full rounded-[22px]" />
const RulesTree = dynamic(() => import("./_components/rules-tree/rules-tree").then((m) => m.RulesTree), {
  ssr: false,
  loading: TabLoading,
})
const StandInsTab = dynamic(() => import("./_components/stand-ins-tab").then((m) => m.StandInsTab), {
  ssr: false,
  loading: TabLoading,
})

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
    tabs,
    shown,
    setTab,
    managesRules,
    settled,
    isLoading,
    isError,
    hasData,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
    items,
    counts,
    waitsForYou,
    visible,
    current,
    decide,
    onDecide,
    unavailable,
    more,
    covering,
    currentDay,
    review,
    back,
    firstStepsOf,
    visibleDays,
    membersOf,
    approveDay,
  } = useApprovalsPage()
  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        tour="page-approvals"
        title={t("approvals.title")}
        subtitle={t("approvals.subtitle")}
        // Refresh and "Updated …" are about the inbox: only on its tab (the other tabs keep themselves current),
        // and only once the tab is known — a "?tab=rules" link must not flash the inbox's controls first.
        actions={
          settled &&
          shown === "decide" && (
            <InboxActions updatedAt={dataUpdatedAt} fetching={isFetching} onRefresh={() => refetch()} />
          )
        }
      />

      {settled && shown === "decide" && (
        <InboxNotices
          covering={covering}
          unavailable={unavailable}
          more={more}
          staleSince={isError && hasData ? dataUpdatedAt : null}
          count={isLoading ? null : items.length}
        />
      )}

      {settled && tabs.length > 1 && (
        <div
          role="tablist"
          aria-label={t("approvals.title")}
          className="mb-4 flex gap-1 border-b border-border"
          // ← / → move between the tabs, Home / End to the first and last (the focus follows), as a tab list does.
          onKeyDown={(e) => {
            const to = tabKeyTarget(e.key, tabs.indexOf(shown), tabs.length)
            if (to == null) return
            e.preventDefault()
            const next = tabs[to]!
            setTab(next)
            document.getElementById(`approvals-tab-${next}`)?.focus()
          }}
        >
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`approvals-tab-${k}`}
              aria-controls="approvals-panel"
              aria-selected={shown === k}
              tabIndex={shown === k ? 0 : -1}
              onClick={() => setTab(k)}
              className={cn(
                "-mb-px h-11 border-b-2 px-3 text-sm font-semibold transition-colors",
                shown === k
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`approvals.tree.tab.${k}`)}
            </button>
          ))}
        </div>
      )}

      {/* A tab panel only while its tab list is drawn — otherwise its label would point at a tab that is not there. */}
      <div
        id="approvals-panel"
        {...(settled && tabs.length > 1 && { role: "tabpanel", "aria-labelledby": `approvals-tab-${shown}` })}
      >
        {/* Which tab, and who is asking, not known yet: a neutral shape — not the inbox's, which may not be the tab. */}
        {!settled ? (
          <TabLoading />
        ) : shown === "rules" ? (
          <RulesTree />
        ) : shown === "stand" ? (
          <StandInsTab />
        ) : isError && !hasData ? (
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
              {waitsForYou.length > 0 && (
                <KindRailItem
                  active={filter === WAITS_FOR_YOU_FILTER}
                  label={t("approvals.tag.waitsForYou")}
                  count={waitsForYou.length}
                  urgent={waitsForYou.some((i) => i.group === "NOW")}
                  onClick={() => setFilter(WAITS_FOR_YOU_FILTER)}
                />
              )}
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
                <InboxEmpty narrowed={filter !== "all" && items.length > 0} onShowAll={() => setFilter("all")} />
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
                          <DayRow
                            key={d.key}
                            day={d}
                            active={d.key === selected}
                            onSelect={() => setSelected(d.key)}
                            waitsForYou={membersOf(d).some((i) => i.step?.waitsForYou)}
                          />
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
                    <BackButton onClick={() => setSelected(null)} />
                    <DayPanel
                      day={currentDay}
                      members={membersOf(currentDay)}
                      busy={approveDay.isPending}
                      onApprove={() => approveDay.mutate(currentDay)}
                      onReview={(i) => review(currentDay.key, itemKey(i))}
                      orgCurrency={user?.orgCurrency}
                    />
                  </Panel>
                ) : current ? (
                  <Panel className="p-5">
                    <BackButton onClick={back} />
                    <DecisionPanel
                      // A first of two approvals given: the form closes and the panel reads the item afresh.
                      key={`${itemKey(current)}:${firstStepsOf(itemKey(current))}`}
                      item={current}
                      text={describeItem(current, t, user?.orgCurrency)}
                      busy={decide.isPending}
                      onDecide={onDecide}
                      onMakeRule={
                        managesRules
                          ? (link) => {
                              // A new entry, so Back returns to the item the rule was made from.
                              window.history.pushState(null, "", link)
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
    </div>
  )
}
