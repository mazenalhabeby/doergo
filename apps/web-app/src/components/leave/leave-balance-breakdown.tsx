"use client"

import { useTranslation } from "react-i18next"
import { ArrowRight } from "lucide-react"
import type { LeaveBalance } from "@/lib/api/types/employees"
import { cn } from "@/lib/utils"
import { dateLocale, formatDayMonth, formatMediumDate } from "@/lib/format-date"
import {
  LEAVE_LINE_LABEL_KEY,
  balanceView,
  formatDays,
  formatLineDays,
  leaveYearLabel,
  remainingAfter,
} from "@/lib/leave-ledger"

/** A YYYY-MM-DD read at noon, so no time zone moves it to the day before. */
const atNoon = (day: string) => `${day.slice(0, 10)}T12:00:00`

/**
 * The vacation balance as a sum of visible lines — the ONE breakdown, on the
 * member's Requests page, in the decision drawer and on the member record.
 *
 *   25  allowance
 *  −10  used before HBCField
 *   +2  carried from last year
 *   −3  taken
 *   ──
 *   14  left
 *
 * The lines come from the server (shared `leaveBalance`); an older server's
 * allowance/taken are laid out by the same function, so this never computes a
 * balance of its own. With `requestDays` it adds what one request would leave:
 * "This request · 3 working days   14 → 11".
 */
export function LeaveBalanceBreakdown({
  balance,
  requestDays,
  className,
  compact = false,
}: {
  balance: LeaveBalance | null | undefined
  /** Working days a request would cost — shows "before → after". */
  requestDays?: number | null
  className?: string
  /** No year heading — for a box that already has its own title. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const view = balanceView(balance)
  if (!view) return null
  const locale = dateLocale()
  const year = leaveYearLabel(view, (d) => formatDayMonth(atNoon(d), false))
  const after = requestDays != null ? remainingAfter(view.remaining, requestDays) : null

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border text-[13px]", className)}>
      {!compact && (
        <div className="flex items-baseline justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("leaveLedger.balanceTitle")}
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            {year.kind === "calendar"
              ? t("leaveLedger.yearCalendar", { year: year.year })
              : t("leaveLedger.yearWork", { from: year.from, to: year.to })}
          </span>
        </div>
      )}
      <dl className="px-3 py-1.5">
        {view.lines.map((line) => (
          <div key={line.key} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="min-w-0 text-muted-foreground">{t(LEAVE_LINE_LABEL_KEY[line.key])}</dt>
            <dd
              className={cn(
                "shrink-0 font-mono tabular-nums",
                line.key === "ALLOWANCE"
                  ? "text-foreground"
                  : line.days < 0
                    ? "text-foreground/80"
                    : "text-shell-accent",
              )}
            >
              {formatLineDays(line, locale)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2 pb-1">
          <dt className="font-medium text-foreground">{t("leaveLedger.remaining")}</dt>
          <dd
            className={cn(
              "font-mono text-[15px] font-semibold tabular-nums",
              view.remaining < 0 ? "text-shell-crit" : "text-foreground",
            )}
          >
            {formatDays(view.remaining, locale)}
          </dd>
        </div>
      </dl>

      {view.pending > 0 && (
        /* Beside the figure, never inside it — a request nobody approved is not time taken. */
        <p className="border-t border-border px-3 py-1.5 text-[11.5px] text-shell-warn">
          {t("timeOff.my.allowancePending", { count: view.pending })}
        </p>
      )}
      {view.carryExpiresOn && view.lines.some((l) => l.key === "CARRY_OVER") && (
        <p className="border-t border-border px-3 py-1.5 text-[11.5px] text-muted-foreground">
          {t("leaveLedger.carryExpires", { date: formatMediumDate(atNoon(view.carryExpiresOn)) })}
        </p>
      )}

      {after != null && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2">
          <span className="min-w-0 text-[12px] text-muted-foreground">
            {t("leaveLedger.thisRequest", { count: requestDays ?? 0 })}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
            <span className="text-muted-foreground">{formatDays(view.remaining, locale)}</span>
            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
            <span className={cn("font-semibold", after < 0 ? "text-shell-crit" : "text-foreground")}>
              {formatDays(after, locale)}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
