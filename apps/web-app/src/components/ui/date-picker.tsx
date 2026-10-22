"use client"

import { format, parseISO, isValid } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import dynamic from "next/dynamic"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
// Date → `YYYY-MM-DD` from the LOCAL parts, for the same reason.
import { localDateKey } from "@hbcfield/shared/client"

/**
 * Pick a date — the one way this product does it.
 *
 * ⚠️ THE POPOVER-PLUS-CALENDAR WAS COPY-PASTED INTO FIVE FILES, and thirty-two
 * other fields used a raw `<input type="date">` instead. So the product had two
 * date controls that look nothing alike, and the native one renders differently
 * in every browser: in a narrow column it shows "dd.m" and a clipped spinner,
 * which is exactly how it turned up on the invoice screen.
 *
 * Five copies is also five places to fix a bug in, and five chances for one of
 * them to disagree about the format — which they already did, because the
 * copies pass `format(d, "MMM d, yyyy")` and the native inputs render whatever
 * the operating system feels like.
 *
 * ⚠️ ISO IN, ISO OUT. The value is a plain `YYYY-MM-DD` string, because that is
 * what every caller here stores and sends. A Date object would drag a timezone
 * into a field that has none — see `formatCalendarDate` in shared for the same
 * trap on the display side, where an ISO date rendered through `new Date()`
 * prints the day before anywhere west of Greenwich.
 */
interface DatePickerProps {
  /** `YYYY-MM-DD`, or "" for no date. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Offer a way back to "no date". Off by default: most dates are required. */
  clearable?: boolean
  disabled?: boolean
  /** Nothing before this may be chosen — a due date cannot precede its issue. */
  fromDate?: Date
  /** Nothing after this may be chosen — something that happened is not dated tomorrow. */
  toDate?: Date
  /** The same bounds as `YYYY-MM-DD`, as a native date input took them ("" = none). */
  min?: string
  max?: string
  className?: string
  /** The trigger's own classes — a filter bar's taller field, a narrow column. */
  triggerClassName?: string
  id?: string
  /** The field's name for a screen reader when no `<Label htmlFor>` points at it. */
  "aria-label"?: string
  title?: string
  /** Put the focus on the field when it appears (a form that opens to fix this one date). */
  autoFocus?: boolean
}

/*
  The month grid (react-day-picker) loads when a picker first opens — it is never on screen
  before that, and it was ~16 kB of the first load of every page with a date field. The
  placeholder is the grid's own size, so the popover does not resize.
*/
const Calendar = dynamic(() => import("@/components/ui/calendar").then((m) => m.Calendar), {
  ssr: false,
  loading: () => <div className="h-[298px] w-[252px]" aria-hidden />,
})

/** `YYYY-MM-DD` → Date, without letting a timezone move it. */
function parseIsoDay(iso: string): Date | undefined {
  if (!iso) return undefined
  const d = parseISO(iso)
  return isValid(d) ? d : undefined
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  clearable = false,
  disabled = false,
  fromDate: fromDateProp,
  toDate: toDateProp,
  min,
  max,
  className,
  triggerClassName,
  id,
  "aria-label": ariaLabel,
  title,
  autoFocus,
}: DatePickerProps) {
  const { t } = useTranslation()
  const selected = parseIsoDay(value)
  const fromDate = fromDateProp ?? parseIsoDay(min ?? "")
  const toDate = toDateProp ?? parseIsoDay(max ?? "")

  return (
    <div className={cn("relative", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            aria-label={ariaLabel}
            title={title}
            autoFocus={autoFocus}
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-start rounded-lg border-border bg-card text-left text-sm font-normal hover:bg-accent",
              !selected && "text-muted-foreground",
              clearable && selected && "pr-8",
              triggerClassName,
            )}
          >
            <CalendarIcon className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected ? format(selected, "d MMM yyyy") : (placeholder ?? t("common.selectDate", "Pick a date"))}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => onChange(d ? localDateKey(d) : "")}
            /*
              Two matchers, never one object: `{ before, after }` together is a
              DateInterval in react-day-picker — it disables the days BETWEEN
              them, which is exactly the days that should stay open.
            */
            disabled={
              fromDate || toDate
                ? [...(fromDate ? [{ before: fromDate }] : []), ...(toDate ? [{ after: toDate }] : [])]
                : undefined
            }
            defaultMonth={selected ?? toDate ?? fromDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/*
        Clearing is a separate control, outside the popover.

        Inside it, "no date" is a row somebody has to open a calendar to reach —
        and every calendar's own way of deselecting is a second click on the
        selected day, which nobody discovers.
      */}
      {clearable && selected && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("common.clear", "Clear")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
