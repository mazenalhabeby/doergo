import { type CalendarItem } from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"
import { fromKey } from "./layout"

/** A calendar item's time, as the quick card writes it. */
export function whenText(item: CalendarItem): string {
  const loc = dateLocale()
  if (item.allDay) {
    const s = fromKey(item.start),
      e = fromKey(item.end)
    const f = (d: Date) => d.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" })
    return item.start === item.end ? f(s) : `${f(s)} – ${f(e)}`
  }
  const s = new Date(item.start),
    e = new Date(item.end)
  return `${s.toLocaleDateString(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })} · ${s.toLocaleTimeString(loc, {
    hour: "2-digit",
    minute: "2-digit",
  })} – ${e.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`
}

/** A reminder offset in words: "at the start", "10 minutes", "1 day"… */
export function offsetLabel(m: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (m === 0) return t("calendar.atStart")
  if (m < 60) return t("calendar.minutes", { count: m })
  if (m < 1440) return t("calendar.hours", { count: m / 60 })
  if (m < 10080) return t("calendar.days", { count: m / 1440 })
  return t("calendar.weeks", { count: m / 10080 })
}
