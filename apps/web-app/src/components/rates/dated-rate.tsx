"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { CalendarClock, Check, History, Loader2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import { formatDayKey, todayDayKey } from "@/lib/day-key"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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

export interface RateHistoryRow {
  cents: number | null
  /** `YYYY-MM-DD` */
  effectiveFrom: string
  state: "past" | "scheduled"
}

export type RateUnit = "hour" | "day"

/** The rate in force today from a history (oldest first) — the last row that has started. */
export function currentOf(rows: RateHistoryRow[] | undefined): number | null {
  let cents: number | null = null
  for (const r of rows ?? []) if (r.state === "past") cents = r.cents
  return cents
}

const useCents = (currency = "EUR") => (cents: number) => formatMoney(cents / 100, currency)

/** The history of one rate, newest first, with today's marked. */
export function RateHistoryList({ rows, currency }: { rows: RateHistoryRow[]; currency?: string }) {
  const { t, i18n } = useTranslation()
  const cents = useCents(currency)
  if (rows.length === 0) return null
  const currentIdx = rows.reduce((acc, r, i) => (r.state === "past" ? i : acc), -1)
  return (
    <ul className="divide-y divide-border/60 rounded-lg border bg-muted/20 px-3">
      {rows.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => {
        const state = r.state === "scheduled" ? "scheduled" : i === currentIdx ? "current" : "earlier"
        return (
          <li key={`${r.effectiveFrom}-${i}`} className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-3 py-1.5 text-sm">
            <span className="text-muted-foreground">
              {r.effectiveFrom === "1970-01-01"
                ? t("rates.sinceAlways")
                : t("rates.from", { date: formatDayKey(r.effectiveFrom, i18n.language) })}
            </span>
            <span className="font-semibold tabular-nums">{r.cents != null ? cents(r.cents) : t("rates.notSet")}</span>
            <span
              className={cn(
                "text-right text-[11px]",
                state === "current" && "font-semibold text-green-600 dark:text-green-400",
                state === "scheduled" && "font-semibold text-blue-600 dark:text-blue-400",
                state === "earlier" && "text-muted-foreground",
              )}
            >
              {t(`rates.state.${state}`)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Change (or schedule) a rate from a day.
 *
 * The FIRST rate a record ever has, with no day chosen, applies to everything
 * not yet invoiced — the server's rule — and the dialog says so. Only a start
 * day the person actually chose is sent.
 */
export function ChangeRateDialog({
  open,
  onOpenChange,
  title,
  unit,
  currentCents,
  history,
  currency,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  unit: RateUnit
  currentCents: number | null
  history: RateHistoryRow[]
  currency?: string
  onSubmit: (cents: number | null, effectiveFrom?: string) => Promise<unknown>
}) {
  const { t, i18n } = useTranslation()
  const cents = useCents(currency)
  const today = todayDayKey()
  const [value, setValue] = useState(currentCents != null ? String(currentCents / 100) : "")
  const [from, setFrom] = useState(today)
  const [touched, setTouched] = useState(false)
  const sinceAlways = history.length === 0 && !touched

  // What applied the day BEFORE the new rate starts — what earlier work keeps.
  const before = useMemo(() => {
    let r: number | null = null
    for (const h of history) if (h.effectiveFrom < from) r = h.cents
    return r
  }, [history, from])

  const nextCents = value.trim() === "" ? null : Math.round(Number(value) * 100)
  const valid = value.trim() === "" || (Number.isFinite(Number(value)) && Number(value) >= 0)
  const date = formatDayKey(from, i18n.language)
  const scheduled = !sinceAlways && from > today
  const unitLabel = unit === "day" ? t("rates.perDay") : t("rates.perHour")

  const save = useMutation({
    mutationFn: () => onSubmit(nextCents, sinceAlways ? undefined : from),
    onSuccess: () => {
      notify.success(scheduled ? t("rates.scheduledToast") : t("rates.savedToast"))
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const note = (tone: "keep" | "new", text: string) => (
    <li
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "keep"
          ? "border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200"
          : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200",
      )}
    >
      {text}
    </li>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("rates.changeDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rate-new" className="text-xs">{t("rates.newRate")}</Label>
            <div className="relative">
              <Input
                id="rate-new"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("rates.blankInherits")}
                className="h-9 pr-14 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {unitLabel}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate-from" className="text-xs">{t("rates.startsFrom")}</Label>
            <DatePicker id="rate-from" value={from} onChange={(v) => { setFrom(v || today); setTouched(true) }} />
          </div>
        </div>
        <ul className="space-y-1.5 text-sm">
          {sinceAlways ? (
            note("new", t("rates.firstRate"))
          ) : (
            <>
              {note("keep", before != null ? t("rates.keeps", { date, rate: cents(before) }) : t("rates.keepsNone", { date }))}
              {note("keep", t("rates.issuedSafe"))}
              {note("new", nextCents != null ? t("rates.uses", { date, rate: cents(nextCents) }) : t("rates.usesNone", { date }))}
            </>
          )}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !valid} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {scheduled ? t("rates.schedule") : t("rates.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
              {cents(currentCents)} <span className="text-xs font-normal text-muted-foreground">{unit === "day" ? t("rates.perDay") : t("rates.perHour")}</span>
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
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => setShowHistory((v) => !v)}>
              <History className="h-3.5 w-3.5" />
              {showHistory ? t("rates.hideHistory") : t("rates.history")}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="h-8" disabled={disabled || history === undefined} onClick={() => setOpen(true)}>
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
