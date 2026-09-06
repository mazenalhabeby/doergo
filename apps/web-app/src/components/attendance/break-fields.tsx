"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type BreakKind = "SHORT" | "LUNCH" | "OTHER"

/**
 * One break, entered the same way wherever it is entered.
 *
 * ⚠️ Adding attendance asked for a NUMBER OF MINUTES; editing it asked for a
 * start, an end, a type and a reason. Two forms for one thing — and behind them,
 * until this pass, two different records: the number never became a break at
 * all, so it was invisible on the screen that lists them and was erased by the
 * first edit that touched breaks.
 *
 * The record is one thing now, and so is the form.
 *
 * The one real difference between the two callers is the CLOCK. Editing an entry
 * is about a known day, so it takes full date-times. Adding covers a range —
 * possibly twenty days at once — where the only thing that can be said is a
 * wall-clock time that applies to each of them. That is the `mode`, and it is
 * the whole of the difference.
 */
export function BreakFields({
  mode,
  start,
  end,
  kind,
  reason,
  onStart,
  onEnd,
  onKind,
  onReason,
  min,
  max,
  error,
  hint,
}: {
  /** `datetime` for one known day; `time` for a wall-clock time across a range. */
  mode: "datetime" | "time"
  start: string
  end: string
  kind: BreakKind
  reason: string
  onStart: (v: string) => void
  onEnd: (v: string) => void
  onKind: (v: BreakKind) => void
  onReason: (v: string) => void
  /** Shift bounds, so the browser refuses the obvious mistakes before we do. */
  min?: string
  max?: string
  /** Shown in place of the hint when the break does not fit its shift. */
  error?: string | null
  hint?: string
}) {
  const { t } = useTranslation()
  const type = mode === "datetime" ? "datetime-local" : "time"

  return (
    <div className="space-y-3">
      {(error || hint) && (
        <p className={cn("text-[11px] leading-relaxed", error ? "text-destructive" : "text-muted-foreground")}>
          {error || hint}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("attendance.addBreak.start", "Break start")}</Label>
          <Input
            type={type}
            value={start}
            min={min}
            max={max}
            aria-invalid={!!error}
            className={cn(error && "border-destructive focus-visible:ring-destructive")}
            onChange={(e) => onStart(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("attendance.addBreak.end", "Break end")}</Label>
          <Input
            type={type}
            value={end}
            // The end cannot precede the start, so the field says so itself.
            min={start || min}
            max={max}
            aria-invalid={!!error}
            className={cn(error && "border-destructive focus-visible:ring-destructive")}
            onChange={(e) => onEnd(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("attendance.addBreak.type", "Type")}</Label>
        <div className="flex gap-1.5">
          {(["SHORT", "LUNCH", "OTHER"] as const).map((bt) => (
            <button
              key={bt}
              type="button"
              aria-pressed={kind === bt}
              onClick={() => onKind(bt)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                kind === bt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`attendance.breaks.typeBreak.${bt.toLowerCase()}`, bt)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          {t("attendance.addBreak.reason", "Why")} <span className="text-destructive">*</span>
        </Label>
        <Input
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder={t("attendance.addBreak.reasonPlaceholder", "e.g. phone died before lunch")}
        />
      </div>
    </div>
  )
}

/**
 * Is this break inside its shift, and the right way round?
 *
 * Shared because both dialogs must answer it identically — and because the
 * server answers it a third time. A break that does not fit is not a smaller
 * break: it is a clock-out that moved, or a start somebody mistyped.
 *
 * Minutes since midnight, so it works on `HH:mm` and on the time half of a
 * `datetime-local` without either caller parsing dates.
 */
export function breakFitsShift(
  breakStart: string,
  breakEnd: string,
  shiftStart: string,
  shiftEnd: string,
): boolean {
  const mins = (v: string) => {
    const [h, m] = v.slice(-5).split(":").map(Number)
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
  }
  const bs = mins(breakStart)
  const be = mins(breakEnd)
  const ss = mins(shiftStart)
  let se = mins(shiftEnd)
  if ([bs, be, ss, se].some((n) => !Number.isFinite(n))) return false
  // An overnight shift runs past midnight; so does a break inside one.
  if (se <= ss) se += 24 * 60
  const b1 = bs < ss ? bs + 24 * 60 : bs
  const b2 = be <= b1 ? be + 24 * 60 : be
  return b1 >= ss && b2 <= se && b2 > b1
}
