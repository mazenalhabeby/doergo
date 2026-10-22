"use client"

import { useTimeFormat } from "@/hooks"
import { Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { localDateKey } from "@hbcfield/shared/client"
import type { DateRange } from "react-day-picker"

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
