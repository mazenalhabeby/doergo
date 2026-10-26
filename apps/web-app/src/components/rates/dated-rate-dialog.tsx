"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Check, Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatMoney, MONEY_LOCALE } from "@/lib/money"
import { formatDayKey } from "@/lib/day-key"
import { todayKey } from "@hbcfield/shared/client"
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

/** The rate history list and the change-rate dialog that DatedRate opens. */
export interface RateHistoryRow {
  cents: number | null
  /** `YYYY-MM-DD` */
  effectiveFrom: string
  state: "past" | "scheduled"
}

export type RateUnit = "hour" | "day"

export const useCents =
  (currency = "EUR") =>
  (cents: number) =>
    formatMoney(cents, currency, MONEY_LOCALE)

/** The history of one rate, newest first, with today's marked. */
export function RateHistoryList({ rows, currency }: { rows: RateHistoryRow[]; currency?: string }) {
  const { t, i18n } = useTranslation()
  const cents = useCents(currency)
  if (rows.length === 0) return null
  const currentIdx = rows.reduce((acc, r, i) => (r.state === "past" ? i : acc), -1)
  return (
    <ul className="divide-y divide-border/60 rounded-lg border bg-muted/20 px-3">
      {rows
        .map((r, i) => ({ r, i }))
        .reverse()
        .map(({ r, i }) => {
          const state = r.state === "scheduled" ? "scheduled" : i === currentIdx ? "current" : "earlier"
          return (
            <li
              key={`${r.effectiveFrom}-${i}`}
              className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-3 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">
                {r.effectiveFrom === "1970-01-01"
                  ? t("rates.sinceAlways")
                  : t("rates.from", { date: formatDayKey(r.effectiveFrom, i18n.language) })}
              </span>
              <span className="font-semibold tabular-nums">{r.cents != null ? cents(r.cents) : t("rates.notSet")}</span>
              <span
                className={cn(
                  "text-right text-[11px]",
                  state === "current" && "font-semibold text-shell-accent",
                  state === "scheduled" && "font-semibold text-foreground",
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
  const today = todayKey()
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
          ? "border-transparent bg-shell-accent-soft text-foreground"
          : "border-transparent bg-shell-chip text-foreground",
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
            <Label htmlFor="rate-new" className="text-xs">
              {t("rates.newRate")}
            </Label>
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
            <Label htmlFor="rate-from" className="text-xs">
              {t("rates.startsFrom")}
            </Label>
            <DatePicker
              id="rate-from"
              value={from}
              onChange={(v) => {
                setFrom(v || today)
                setTouched(true)
              }}
            />
          </div>
        </div>
        <ul className="space-y-1.5 text-sm">
          {sinceAlways ? (
            note("new", t("rates.firstRate"))
          ) : (
            <>
              {note(
                "keep",
                before != null ? t("rates.keeps", { date, rate: cents(before) }) : t("rates.keepsNone", { date }),
              )}
              {note("keep", t("rates.issuedSafe"))}
              {note(
                "new",
                nextCents != null ? t("rates.uses", { date, rate: cents(nextCents) }) : t("rates.usesNone", { date }),
              )}
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
