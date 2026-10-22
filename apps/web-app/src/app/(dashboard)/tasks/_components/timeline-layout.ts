import { dateLocale, formatMonthYear } from "@/lib/format-date"

/** The timeline's measurements and easing, shared by its task list, chart and tooltip. */
export type TimeScale = "day" | "week" | "month"

export const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export const ROW_HEIGHT = 36

export const HEADER_HEIGHT = 52

export const LEFT_PANEL_WIDTH = 260

export function formatHeaderDate(d: Date, scale: TimeScale): string {
  if (scale === "day") {
    return d.toLocaleDateString(dateLocale(), { weekday: "short", month: "short", day: "numeric" })
  }
  if (scale === "week") {
    return d.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
  }
  // month
  return formatMonthYear(d, false)
}
