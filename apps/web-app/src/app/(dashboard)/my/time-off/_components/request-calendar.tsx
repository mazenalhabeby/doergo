"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { TimeOffRequest } from "@hbcfield/shared"
import { cn } from "@/lib/utils"
import { formatMonthYear } from "@/lib/format-date"
import { isAbsence } from "@/lib/requests"
import { Panel } from "@/components/page/page-kit"
import { monthGrid, sameDay, toISO } from "../_lib/request-calendar"

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  )
}

/** One month to pick the request's days on, with the days already booked marked. */
export function RequestCalendar({
  cursor,
  setCursor,
  today,
  booked,
  pickDay,
  setHovered,
  inRange,
  isEdge,
  manyKinds,
}: {
  /** The first day of the month shown. */
  cursor: Date
  setCursor: (month: Date) => void
  today: Date
  /** Day key → the request already on it. */
  booked: Map<string, TimeOffRequest>
  pickDay: (d: Date) => void
  setHovered: (d: Date | null) => void
  inRange: (d: Date) => boolean
  isEdge: (d: Date) => boolean
  /** More than one kind of request is offered — then the legend names "not leave". */
  manyKinds: boolean
}) {
  const { t } = useTranslation()
  const weeks = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const weekdays = t("timeOff.my.weekdays", { defaultValue: "Mo,Tu,We,Th,Fr,Sa,Su" }).split(",")
  const monthLabel = formatMonthYear(cursor)

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={t("timeOff.my.prevMonth")}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[15px] font-semibold capitalize text-foreground">{monthLabel}</span>
        <button
          type="button"
          aria-label={t("timeOff.my.nextMonth")}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {weekdays.map((w) => (
          <span key={w} className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {w}
          </span>
        ))}
        {weeks.flat().map((d, i) => {
          if (!d) return <span key={`x${i}`} />
          const iso = toISO(d)
          const past = d < today
          const edge = isEdge(d)
          const mid = inRange(d)
          const book = booked.get(iso)
          return (
            <button
              key={iso}
              type="button"
              disabled={past}
              onClick={() => pickDay(d)}
              onMouseEnter={() => setHovered(d)}
              onMouseLeave={() => setHovered(null)}
              title={book?.reason ?? undefined}
              className={cn(
                "relative flex h-[42px] w-full flex-col items-center justify-center rounded-xl text-sm transition-all duration-150",
                past && "cursor-not-allowed text-muted-foreground/35",
                !past && !edge && !mid && "text-foreground hover:bg-accent",
                mid && "rounded-none bg-muted text-foreground",
                edge && "bg-foreground font-semibold text-background",
                !past &&
                  sameDay(d, today) &&
                  !edge &&
                  !mid &&
                  "font-semibold shadow-[inset_0_0_0_1.5px_hsl(var(--foreground))]",
              )}
            >
              {d.getDate()}
              {/* Already booked — the answer to "what have I got?" shown
                  where the question is asked, not on a list further down. */}
              {book && !edge && (
                <span
                  className={cn(
                    "absolute bottom-1 rounded-full",
                    isAbsence(book.kind)
                      ? cn("h-1 w-1", book.status === "APPROVED" ? "bg-shell-live" : "bg-shell-warn")
                      : // Not a day off — a ring, so it never reads as leave.
                        cn(
                          "h-1.5 w-1.5 border",
                          book.status === "APPROVED" ? "border-shell-live" : "border-shell-warn",
                        ),
                  )}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <Legend className="bg-shell-live" label={t("timeOff.my.legendApproved")} />
        <Legend className="bg-shell-warn" label={t("timeOff.my.legendPending")} />
        <Legend className="bg-foreground" label={t("timeOff.my.legendSelected")} />
        {manyKinds && (
          <Legend className="border border-muted-foreground bg-transparent" label={t("requests.legendNotLeave")} />
        )}
      </div>
    </Panel>
  )
}
