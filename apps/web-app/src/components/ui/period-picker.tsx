"use client"

import * as React from "react"
import { parseISO, isValid } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"

/**
 * A period of days — month presets, "outstanding", or a range of one's own.
 *
 * ⚠️ EVERY CHOICE SHOWS REAL DATES. "All outstanding" used to leave From and To
 * empty, so the screen never said which days were being charged for and the
 * invoice went out with no service period at all. Outstanding now reads its
 * dates from the work itself: the first and last day with something unbilled.
 *
 * ⚠️ ONE FIELD, ONE CALENDAR. Two separate From/To boxes let somebody set a
 * start after the end, and give no view of the range as a whole. Here the first
 * click is the start, the second the end — in either order.
 *
 * ⚠️ ISO IN, ISO OUT (`YYYY-MM-DD`), read and written from LOCAL parts, for the
 * same reason as DatePicker: a Date carries a timezone this field has none of.
 */
export type PeriodMode = "last" | "this" | "custom"

export interface PeriodValue {
  mode: PeriodMode
  /** The chosen days (custom); a month preset carries its own. */
  from: string
  to: string
}

interface PeriodPickerProps {
  value: PeriodValue
  onChange: (value: PeriodValue) => void
  /**
   * Days with something still to bill, sorted. Marks the calendar and finds
   * work left BEFORE the dates. `undefined` = not known yet (still loading).
   */
  workDays?: string[]
  /** Asked for when the calendar opens — lets the caller load `workDays` only then. */
  onOpenChange?: (open: boolean) => void
  className?: string
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function dayOf(iso: string): Date | undefined {
  if (!iso) return undefined
  const d = parseISO(iso)
  return isValid(d) ? d : undefined
}

/** The first and last day of a whole month, `shift` months from now. */
export function monthBounds(shift: number, now = new Date()): [string, string] {
  // Day 0 of the NEXT month is the last day of this one.
  return [
    isoOf(new Date(now.getFullYear(), now.getMonth() + shift, 1)),
    isoOf(new Date(now.getFullYear(), now.getMonth() + shift + 1, 0)),
  ]
}

/** The days a value stands for: a preset's month, the work's span, or the chosen range. */
export function periodDays(value: PeriodValue): { from: string; to: string } {
  if (value.mode === "last") { const [from, to] = monthBounds(-1); return { from, to } }
  if (value.mode === "this") { const [from, to] = monthBounds(0); return { from, to } }
  return { from: value.from, to: value.to }
}

/** What to ASK the server for: the days on screen. */
export function periodQuery(value: PeriodValue): { from?: string; to?: string } {
  const { from, to } = periodDays(value)
  return { from: from || undefined, to: to || undefined }
}

/** A custom range that happens to be a whole preset month reads as that preset. */
function normalise(from: string, to: string): PeriodValue {
  for (const [mode, shift] of [["last", -1], ["this", 0]] as const) {
    const [f, t] = monthBounds(shift)
    if (from === f && to === t) return { mode, from, to }
  }
  return { mode: "custom", from, to }
}

export function PeriodPicker({ value, onChange, workDays, onOpenChange, className }: PeriodPickerProps) {
  const { t, i18n } = useTranslation()
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [start, setStart] = React.useState<string | null>(null)

  const { from, to } = periodDays(value)
  const lang = i18n.language || "en"
  const monthLong = (shift: number) => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + shift, 1)
      .toLocaleDateString(lang, { month: "long", year: "numeric" })
  }
  const fmt = (iso: string) =>
    dayOf(iso)?.toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" }) ?? ""

  const work = React.useMemo(() => (workDays ?? []).map(dayOf).filter((d): d is Date => !!d), [workDays])
  const inRange = React.useMemo(
    () => (from && to && workDays ? workDays.filter((d) => d >= from && d <= to).length : null),
    [from, to, workDays],
  )
  /*
    Unbilled days BEFORE the chosen dates — an older month still owed an
    invoice. Work AFTER them is simply next month's invoice, not a warning.
  */
  const outside = from && workDays ? workDays.filter((d) => d < from).length : 0
  const span = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0

  const setOpenTo = (o: boolean) => {
    setOpen(o)
    setStart(null)
    onOpenChange?.(o)
  }

  const presets: [PeriodMode, string][] = [
    ["last", t("invoices.create.periodLastMonth")],
    ["this", t("invoices.create.periodThisMonth")],
    ["custom", t("invoices.create.periodCustom")],
  ]

  const selected = start
    ? { from: dayOf(start), to: dayOf(start) }
    : { from: dayOf(from), to: dayOf(to) }

  return (
    <div className={className}>
      <div
        role="group"
        aria-label={t("invoices.create.period")}
        className="grid grid-cols-3 gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
      >
        {presets.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value.mode === mode}
            onClick={() => {
              if (mode === "custom") {
                // Start from what is on screen, so Custom never blanks the dates.
                onChange({ mode, from, to })
                setOpenTo(true)
                return
              }
              onChange({ mode, from: "", to: "" })
            }}
            className={cn(
              "truncate rounded-md px-1 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-blue-500",
              value.mode === mode
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpenTo}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium tabular-nums">
                {from && to ? `${fmt(from)} – ${fmt(to)}` : t("invoices.create.periodPickDates")}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {value.mode === "custom"
                  ? from && to ? t("invoices.create.periodCustomHint") : t("invoices.create.periodPickDatesHint")
                  : monthLong(value.mode === "last" ? -1 : 0)}
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={isMobile ? 1 : 2}
            selected={selected}
            defaultMonth={dayOf(from) ?? work[0]}
            onSelect={(_range, day) => {
              const iso = isoOf(day)
              if (!start) { setStart(iso); return }
              const [a, b] = iso < start ? [iso, start] : [start, iso]
              onChange(normalise(a, b))
              setOpenTo(false)
            }}
            modifiers={{ work }}
            modifiersClassNames={{
              work: "relative after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-blue-500",
            }}
          />
          <div className="flex items-center justify-between gap-4 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-blue-500" />
              {workDays === undefined ? "…" : t("invoices.create.periodWorkDay")}
            </span>
            <span>{start ? t("invoices.create.periodPickEnd") : t("invoices.create.periodPickStart")}</span>
          </div>
        </PopoverContent>
      </Popover>

      {from && to && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {inRange === null
            ? t("invoices.create.periodSpan", { count: span })
            : t("invoices.create.periodSpanWork", { count: span, work: inRange })}
        </p>
      )}
      {/*
        ⚠️ WORK OUTSIDE THE DATES IS SAID, never silently left behind. With no
        "everything outstanding" choice, a month that is still unbilled from
        before would otherwise simply never appear on any invoice.
      */}
      {outside > 0 && workDays && (
        <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t("invoices.create.periodOutside", { count: outside, from: fmt(workDays[0]!) })}
          <button
            type="button"
            className="ml-1.5 font-semibold underline underline-offset-2"
            onClick={() => onChange(normalise(workDays[0]!, to))}
          >
            {t("invoices.create.periodIncludeAll")}
          </button>
        </p>
      )}
    </div>
  )
}
