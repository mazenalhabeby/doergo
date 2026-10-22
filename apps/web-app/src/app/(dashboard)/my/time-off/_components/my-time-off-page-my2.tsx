"use client"

import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { leaveCostInBalanceYear } from "@hbcfield/shared/client"
import { isOneDayKind, requestKindEffectKey } from "@/lib/requests"
import { LeaveBalanceBreakdown } from "@/components/leave/leave-balance-breakdown"
import { toISO, sameDay } from "../_hooks/use-my-time-off-page"
import { fmt } from "./my-time-off-page-helpers"
import type { MyTimeOffPageState } from "../_hooks/use-my-time-off-page"

/** Part of MyTimeOffPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MyTimeOffPageMy2({ vm }: { vm: MyTimeOffPageState }) {
  const {
    rangeStart,
    rangeEnd,
    kind,
    cost,
    t,
    dayCount,
    reasonType,
    balance,
    problem,
    clash,
  } = vm
  return (
    <div className={cn("grid transition-all duration-300 ease-out",
      rangeStart ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
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
          ) : !isOneDayKind(kind) && (
            <p className="mt-0.5 text-xs text-muted-foreground">{t("timeOff.my.dayCount", { count: dayCount })}</p>
          )}
          {kind === "LEAVE" && cost && (cost.restDays > 0 || cost.holidays.length > 0) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {[
                cost.restDays > 0 ? t("timeOff.my.restDaysLeftOut", { count: cost.restDays }) : null,
                ...cost.holidays.map((h) => `${h.name}${h.halfDay ? ` (${t("timeOff.my.halfDay")})` : ""}`),
              ].filter(Boolean).join(" · ")}
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
            <span>{t("timeOff.my.overlapWarning", {
              from: fmt(clash.startDate), to: fmt(clash.endDate),
            })}</span>
          </p>
        )}
      </div>
    </div>
  )
}
