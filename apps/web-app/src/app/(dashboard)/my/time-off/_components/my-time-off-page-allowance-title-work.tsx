"use client"

import { CalendarDays, Clock3 } from "lucide-react"
import { ProgressRing } from "@/components/common/progress-ring"
import { fmt } from "./my-time-off-page-helpers"
import { StatTile } from "@/components/ui/stat-tile"
import type { MyTimeOffPageState } from "../_hooks/use-my-time-off-page"

/** Part of MyTimeOffPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MyTimeOffPageAllowanceTitleWork({ vm }: { vm: MyTimeOffPageState }) {
  const { balance, yearLabel, t, showLines, setShowLines, stats } = vm
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-[auto_1fr]">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
        <ProgressRing
          tone="low"
          value={balance?.remaining ?? 0}
          total={balance?.allowance ?? 0}
          caption={(balance?.allowance ?? 0) > 0 ? `/ ${balance?.allowance}` : ""}
          loading={!balance}
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {yearLabel?.kind === "work"
              ? t("leaveLedger.allowanceTitleWork", { from: yearLabel.from, to: yearLabel.to })
              : t("timeOff.my.allowanceTitle", { year: yearLabel?.year ?? new Date().getFullYear() })}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {t("timeOff.my.allowanceOf", { taken: balance?.taken ?? 0, total: balance?.allowance ?? 0 })}
          </p>
          {!!balance?.pending && (
            /* Beside the figure, never inside it: a request nobody has
               approved yet is not time the person has taken. */
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              {t("timeOff.my.allowancePending", { count: balance.pending })}
            </p>
          )}
          {balance && (
            <button
              type="button"
              aria-expanded={showLines}
              onClick={() => setShowLines((v) => !v)}
              className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {showLines ? t("leaveLedger.hideLines") : t("leaveLedger.showLines")}
            </button>
          )}
          {balance?.prorated && (
            /* A joiner sees a number nobody else has. Unexplained, that reads
               as an error or as being short-changed — so it says why, and
               what a full year would have been. */
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("timeOff.my.allowanceProrated", {
                full: balance.fullAllowance ?? 0,
                date: balance.startedOn ? fmt(balance.startedOn) : "",
              })}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={Clock3}
          value={String(stats.pending)}
          label={t("timeOff.my.statPending")}
          tone={stats.pending > 0 ? "warning" : "neutral"}
          iconTone={stats.pending > 0 ? "warning" : "neutral"}
        />
        <StatTile
          icon={CalendarDays}
          iconTone="neutral"
          value={<span className="text-sm">{stats.next ? fmt(stats.next.startDate) : "—"}</span>}
          label={t("timeOff.my.statNext")}
        />
      </div>
    </div>
  )
}
