"use client"

import { useEffect, useState } from "react"
import { useTimeFormat } from "@/hooks"
import { Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { ProgressRing } from "@/components/progress-ring"
import { formatDuration, localDateKey } from "@hbcfield/shared/client"
import type { DateRange } from "react-day-picker"
import { dateLocale } from "@/lib/format-date"

/** MyAttendancePage's module-level helpers, moved here unchanged so its sections can read them too. */
/** Human-readable duration between two ISO timestamps (or to now). */
export function duration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso) return "—"
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  return formatDuration(Math.max(0, Math.round((to - from) / 60000)))
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(dateLocale(), { weekday: "short", month: "short", day: "numeric" })
}

/**
 * The clock that is actually running.
 *
 * A shift in progress is the one thing on this page that changes while somebody
 * looks at it, and a number frozen at the moment the page loaded says the
 * opposite of what a live shift is.
 *
 * Its own component on purpose: a second-by-second tick in the page would
 * re-render the history list, the week strip and every button sixty times a
 * minute. Here it re-renders one span.
 */
export function LiveShift({ since, target }: { since: string; target: { start: number; totalMins: number } | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const mins = Math.max(0, (now - new Date(since).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = Math.floor(mins % 60)
  const sec = Math.floor((mins * 60) % 60)

  return (
    <div className="flex items-center gap-4">
      {target && (
        <ProgressRing
          value={Math.min(mins, target.totalMins)}
          total={target.totalMins}
          label={`${Math.round((Math.min(mins, target.totalMins) / target.totalMins) * 100)}%`}
          size={64}
        />
      )}
      <div>
        <div className="text-[28px] font-semibold leading-none tabular-nums text-foreground">
          {h}:{String(m).padStart(2, "0")}
          <span className="text-base text-muted-foreground">:{String(sec).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * The window, chosen once.
 *
 * Two separate pickers asked the same person the same question twice and let
 * them answer it inconsistently — a "to" before its "from" is a state the form
 * has to catch and explain, and the second popover made picking a fortnight
 * four clicks and two menus.
 *
 * `mode="range"` is one gesture: click the first day, click the last, done. The
 * calendar cannot express a backwards range, so the validation it replaces has
 * nothing left to catch. Same composition the member's time-off dialog already
 * uses — Button, Popover, the shared Calendar.
 *
 * Values stay "yyyy-MM-dd" strings, because that is what the API takes; the
 * Date objects exist only while the calendar is open.
 */
export function RangeField({
  from,
  to,
  onChange,
  placeholder,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  placeholder: string
}) {
  const { locale } = useTimeFormat()
  const selected: DateRange | undefined = from
    ? { from: new Date(`${from}T00:00:00`), to: to ? new Date(`${to}T00:00:00`) : undefined }
    : undefined

  const show = (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 justify-start rounded-lg text-left text-sm font-normal", !from && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
          {selected?.from
            ? selected.to
              ? `${show(selected.from)} — ${show(selected.to)}`
              : show(selected.from)
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
          mode="range"
          selected={selected}
          onSelect={(r) => onChange(r?.from ? localDateKey(r.from) : "", r?.to ? localDateKey(r.to) : "")}
          // Two months, because a range that crosses one is the common case —
          // "the last fortnight" should not need a click into the previous page.
          numberOfMonths={2}
          // Nothing that has not happened: this is a record, not a plan.
          disabled={{ after: new Date() }}
          defaultMonth={selected?.from}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
