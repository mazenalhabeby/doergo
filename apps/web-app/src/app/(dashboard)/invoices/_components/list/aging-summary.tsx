"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { AGE_BANDS, type AgeBand, type summarise } from "../../_lib/aging"
import { formatCurrency } from "../../_lib/list-format"

/**
 * One quiet fact, and — where there is something to do about it — a way in.
 *
 * ⚠️ `onClick` is what separates a figure from a control. "Overdue €18,740"
 * that cannot be clicked is a number a person then has to go and act on
 * somewhere else; the same number that filters the list below is the shortest
 * path between noticing and doing. It is only offered where there is something
 * to show — a nil figure that looks clickable and does nothing is worse than
 * one that plainly is not.
 */
function Stat({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: string
  tone: "bad" | "warn" | "good" | "muted"
  onClick?: () => void
}) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-[22px] border border-border bg-card p-5 text-left shadow-shell",
        onClick && "outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      <b
        className={cn(
          "text-[28px] font-semibold leading-[1.1] tracking-[-0.04em] tabular-nums",
          tone === "bad" ? "text-shell-crit" : tone === "warn" ? "text-shell-warn" : "text-foreground",
        )}
      >
        {value}
      </b>
    </Tag>
  )
}

/**
 * The money, and the shape of it: what is outstanding, how old it is (the
 * legend IS the filter), and the three quieter facts beside it.
 */
export function AgingSummary({
  aging,
  ccy,
  mixedCurrencies,
  awaiting,
  bandFilter,
  setBandFilter,
  setStatusFilter,
  setSearch,
}: {
  aging: ReturnType<typeof summarise>
  ccy: string
  mixedCurrencies: boolean
  awaiting: number
  bandFilter: AgeBand | null
  setBandFilter: (b: AgeBand | null) => void
  setStatusFilter: (s: string) => void
  setSearch: (s: string) => void
}) {
  const { t } = useTranslation()
  const BAND_STYLE: Record<AgeBand, { bar: string; dot: string; label: string }> = {
    current: { bar: "bg-shell-accent", dot: "bg-shell-accent", label: t("invoices.aging.current") },
    d1_30: { bar: "bg-shell-warn/60", dot: "bg-shell-warn/60", label: t("invoices.aging.d1_30") },
    d31_60: { bar: "bg-shell-warn", dot: "bg-shell-warn", label: t("invoices.aging.d31_60") },
    d61_90: { bar: "bg-shell-crit/75", dot: "bg-shell-crit/75", label: t("invoices.aging.d61_90") },
    d90_plus: { bar: "bg-shell-crit", dot: "bg-shell-crit", label: t("invoices.aging.d90_plus") },
  }

  return (
    <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
      <div
        className={
          "flex min-w-0 flex-col gap-2.5 rounded-[22px] border border-border bg-card px-[22px] py-5 shadow-shell " +
          "md:col-span-2 xl:col-span-1"
        }
      >
        <p className="text-[12.5px] font-medium text-muted-foreground">{t("invoices.outstanding")}</p>
        <p className="text-[40px] font-semibold leading-none tracking-[-0.045em] tabular-nums text-foreground">
          {formatCurrency(aging.outstanding, ccy)}
        </p>

        {aging.outstanding > 0 ? (
          <>
            {/* Proportional, so the eye lands on the oldest money without
                    reading a single number. */}
            <div className="mt-1 flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-shell-chip">
              {AGE_BANDS.map((b) => {
                const pct = (aging.bands[b].amount / aging.outstanding) * 100
                if (pct <= 0) return null
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBandFilter(bandFilter === b ? null : b)}
                    title={BAND_STYLE[b].label}
                    aria-label={BAND_STYLE[b].label}
                    className={cn(
                      "h-full transition-opacity hover:opacity-80",
                      BAND_STYLE[b].bar,
                      bandFilter !== null && bandFilter !== b && "opacity-30",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                )
              })}
            </div>

            {/*
                  ⚠️ THE LEGEND IS THE FILTER. It used to be five inert labels:
                  a person read "90+ days €13,450" and then had to go and find
                  those invoices by hand, in a list of fifty. Reading a figure
                  and acting on it were two different jobs on one screen.
                */}
            <div className="flex flex-wrap gap-1.5">
              {AGE_BANDS.map((b) => {
                const cell = aging.bands[b]
                if (!cell.count) return null
                const on = bandFilter === b
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBandFilter(on ? null : b)}
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-full px-2.5 text-[12.5px] outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "bg-shell-nav-on text-shell-nav-on-ink" : "hover:bg-accent",
                    )}
                  >
                    <span className={cn("size-2 shrink-0 rounded-[2px]", BAND_STYLE[b].dot)} />
                    <span className="text-muted-foreground">{BAND_STYLE[b].label}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(cell.amount, ccy)}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("invoices.nothingOutstanding")}</p>
        )}

        {/* Adding euros to dollars produces a number that means nothing.
                Better to admit it than to print a confident total. */}
        {mixedCurrencies && (
          <p className="text-xs font-medium text-shell-warn">
            {t("invoices.mixedCurrencies", { list: aging.currencies.join(", ") })}
          </p>
        )}
      </div>

      {/*
            The three quieter facts. Each one is a QUESTION with an answer, and
            two of them are also a way into the list — see `awaiting`, which
            only exists because ISSUED does.
          */}
      <Stat
        label={t("invoices.overdue")}
        value={formatCurrency(aging.overdue, ccy)}
        tone={aging.overdue > 0 ? "bad" : "muted"}
        onClick={
          aging.overdueCount > 0
            ? () => {
                setBandFilter(null)
                setStatusFilter("__all__")
                setSearch("")
              }
            : undefined
        }
      />
      {/*
              ⚠️ The pile the new ISSUED state created: finished documents the
              client has not been given. Nothing else on this page would show
              them — they are not late, and they are not drafts.
            */}
      <Stat
        label={t("invoices.awaitingSend")}
        value={String(awaiting)}
        tone={awaiting > 0 ? "warn" : "muted"}
        onClick={
          awaiting > 0
            ? () => {
                setBandFilter(null)
                setStatusFilter("ISSUED")
              }
            : undefined
        }
      />
      <Stat
        label={t("invoices.oldestDebt")}
        value={aging.oldestDays === null ? "—" : t("invoices.daysCount", { count: aging.oldestDays })}
        tone={aging.oldestDays === null ? "muted" : aging.oldestDays > 60 ? "bad" : "warn"}
      />
    </div>
  )
}
