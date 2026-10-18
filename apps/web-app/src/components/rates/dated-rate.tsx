"use client"

import { useState } from "react";
import { useTranslation } from "react-i18next"
import { CalendarClock, History } from "lucide-react";

import { formatDayKey } from "@/lib/day-key"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  type RateHistoryRow,
  type RateUnit,
  useCents,
  RateHistoryList,
  ChangeRateDialog,
} from "./dated-rate-dialog"

/**
 * ONE control for every rate in the product — organization default, a
 * workspace, a member, a member at one client, a work role's day rate.
 *
 * ⚠️ A RATE CHANGE STARTS ON A DAY AND NEVER REWRITES THE PAST. So a rate is
 * never a bare input on a form that "Save" overwrites: it is a figure with a
 * Change button that asks from when, and says — before anything is saved —
 * what stays as it is. Five copies of that dialog is how one of them would
 * forget to ask, and that one would quietly re-price last month.
 */

/** The rate in force today from a history (oldest first) — the last row that has started. */
export function currentOf(rows: RateHistoryRow[] | undefined): number | null {
  let cents: number | null = null
  for (const r of rows ?? []) if (r.state === "past") cents = r.cents
  return cents
}

/**
 * A rate as a field: the figure that applies today, a Change button, and the
 * history on demand.
 */
export function DatedRateField({
  id,
  label,
  hint,
  unit = "hour",
  currentCents,
  history,
  currency,
  emptyLabel,
  onSubmit,
  disabled,
}: {
  id: string
  label: string
  hint?: string
  unit?: RateUnit
  currentCents: number | null
  /** Undefined while loading; the Change button waits for it so the dialog knows if this is the first rate. */
  history: RateHistoryRow[] | undefined
  currency?: string
  /** Shown when no rate is set — usually what applies instead. */
  emptyLabel?: string
  onSubmit: (cents: number | null, effectiveFrom?: string) => Promise<unknown>
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const cents = useCents(currency)
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const scheduled = history?.find((h) => h.state === "scheduled")

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <span id={id} className="text-sm font-semibold tabular-nums">
          {currentCents != null ? (
            <>
              {cents(
                currentCents)} <span
                  className="text-xs font-normal text-muted-foreground">{unit === "day" ? t("rates.perDay") : t("rates.perHour")}</span>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">{emptyLabel ?? t("rates.notSet")}</span>
          )}
        </span>
        {scheduled && (
          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
            <CalendarClock className="h-3 w-3" />
            {scheduled.cents != null ? cents(scheduled.cents) : t("rates.notSet")}{" "}
            {t("rates.from", { date: formatDayKey(scheduled.effectiveFrom, i18n.language) })}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {history && history.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={() => setShowHistory((v) => !v)}>
              <History className="h-3.5 w-3.5" />
              {showHistory ? t("rates.hideHistory") : t("rates.history")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={disabled || history === undefined}
            onClick={() => setOpen(true)}>
            {currentCents != null || (history?.length ?? 0) > 0 ? t("rates.change") : t("rates.set")}
          </Button>
        </span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {showHistory && history && <RateHistoryList rows={history} currency={currency} />}
      {open && history && (
        <ChangeRateDialog
          open={open}
          onOpenChange={setOpen}
          title={t("rates.changeTitle", { name: label })}
          unit={unit}
          currentCents={currentCents}
          history={history}
          currency={currency}
          onSubmit={onSubmit}
        />
      )}
    </div>
  )
}
