"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CalendarDays, Clock3 } from "lucide-react"
import type { TimeOffRequest } from "@hbcfield/shared"
import { ProgressRing } from "@/components/common/progress-ring"
import { StatTile } from "@/components/ui/stat-tile"
import { LeaveBalanceBreakdown } from "@/components/leave/leave-balance-breakdown"
import type { LeaveBalance } from "@/lib/api/types/employees"
import type { leaveYearLabel } from "@/lib/leave-ledger"
import { Panel } from "@/components/page/page-kit"
import { fmt } from "../_lib/request-calendar"

/**
 * Remaining vacation as a ring.
 *
 * Only the APPROVED portion is filled. Pending days are reported next to it in
 * words rather than shaded in, because a half-shaded ring reads as "already
 * gone" for days a manager has not yet agreed to.
 *
 * Beside it: requests waiting for an answer, and the next day off.
 */
export function AllowanceSummary({
  balance,
  yearLabel,
  stats,
}: {
  balance: LeaveBalance | null | undefined
  yearLabel: ReturnType<typeof leaveYearLabel> | null
  stats: { pending: number; next: TimeOffRequest | null }
}) {
  const { t } = useTranslation()
  /* "How is this counted?" — the balance's lines, opened on demand beside the ring. */
  const [showLines, setShowLines] = useState(false)
  return (
    <>
      <div className="mb-4 grid gap-3.5 sm:grid-cols-[auto_1fr]">
        <Panel as="div" className="flex items-center gap-4 px-5 py-4">
          <ProgressRing
            tone="low"
            value={balance?.remaining ?? 0}
            total={balance?.allowance ?? 0}
            caption={(balance?.allowance ?? 0) > 0 ? `/ ${balance?.allowance}` : ""}
            loading={!balance}
          />
          <div>
            <p className="text-[13px] text-muted-foreground">
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
              <p className="mt-0.5 text-xs text-shell-warn">
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
        </Panel>

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
      {showLines && balance && <LeaveBalanceBreakdown balance={balance} className="mb-5 bg-card sm:max-w-md" />}
    </>
  )
}
