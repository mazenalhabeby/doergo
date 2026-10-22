"use client"

import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"
import type { TimeOffRequest } from "@hbcfield/shared"
import { cn } from "@/lib/utils"
import { leaveCostInBalanceYear } from "@hbcfield/shared/client"
import { isOneDayKind, requestKindEffectKey, type RequestKind } from "@/lib/requests"
import { LeaveBalanceBreakdown } from "@/components/leave/leave-balance-breakdown"
import type { LeaveBalance } from "@/lib/api/types/employees"
import type { LeaveCountResult } from "@/lib/api/types/calendar"
import type { ReasonKey } from "./reason-types"
import { fmt, sameDay, toISO } from "../_lib/request-calendar"

/**
 * The picked days, said back before sending: the dates, what they cost, the balance after (for
 * vacation), what approving another kind will do, and a clash with leave already booked.
 */
export function RequestSummary({
  rangeStart,
  rangeEnd,
  kind,
  cost,
  dayCount,
  reasonType,
  balance,
  problem,
  clash,
}: {
  rangeStart: Date | null
  rangeEnd: Date | null
  kind: RequestKind
  cost: LeaveCountResult | undefined
  dayCount: number
  reasonType: ReasonKey | null
  balance: LeaveBalance | null | undefined
  problem: string | null
  clash: TimeOffRequest | null
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-out",
        rangeStart ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden space-y-2">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="text-sm text-foreground">
            {rangeStart && fmt(toISO(rangeStart))}
            {rangeEnd && !sameDay(rangeEnd, rangeStart!) && <> → {fmt(toISO(rangeEnd))}</>}
          </p>
          {kind === "LEAVE" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cost && cost.counted !== cost.calendarDays
                ? t("timeOff.my.workingDayCount", { count: cost.counted, total: cost.calendarDays })
                : t("timeOff.my.dayCount", { count: cost?.counted ?? dayCount })}
            </p>
          ) : (
            !isOneDayKind(kind) && (
              <p className="mt-0.5 text-xs text-muted-foreground">{t("timeOff.my.dayCount", { count: dayCount })}</p>
            )
          )}
          {kind === "LEAVE" && cost && (cost.restDays > 0 || cost.holidays.length > 0) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {[
                cost.restDays > 0 ? t("timeOff.my.restDaysLeftOut", { count: cost.restDays }) : null,
                ...cost.holidays.map((h) => `${h.name}${h.halfDay ? ` (${t("timeOff.my.halfDay")})` : ""}`),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {kind === "LEAVE" && reasonType === "vacation" && balance && (
          /* Only vacation is deducted: the balance before and after, line by line — the drawer shows the same. */
          <LeaveBalanceBreakdown
            balance={balance}
            requestDays={cost && balance ? leaveCostInBalanceYear(balance, cost) : (cost?.counted ?? dayCount)}
            compact
          />
        )}
        {kind !== "LEAVE" && (
          /* What approving it will do — said BEFORE sending, the same words the manager reads. */
          <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            {t(requestKindEffectKey(kind))}
          </p>
        )}
        {problem && <p className="px-1 text-xs text-muted-foreground">{problem}</p>}
        {clash && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t("timeOff.my.overlapWarning", {
                from: fmt(clash.startDate),
                to: fmt(clash.endDate),
              })}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
