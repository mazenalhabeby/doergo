"use client"

import { type CalendarItem } from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"
import { fromKey } from "../_lib/layout"

/** Parts moved here unchanged from item-popover.tsx (line length pass). */
export function whenText(item: CalendarItem): string {
  const loc = dateLocale()
  if (item.allDay) {
    const s = fromKey(item.start), e = fromKey(item.end)
    const f = (d: Date) => d.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" })
    return item.start === item.end ? f(s) : `${f(s)} – ${f(e)}`
  }
  const s = new Date(item.start), e = new Date(item.end)
  return `${s.toLocaleDateString(
    loc,
    {
      weekday: "short",
      day: "numeric",
      month: "short"
    })} · ${s.toLocaleTimeString(
      loc,
      { hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`
}
