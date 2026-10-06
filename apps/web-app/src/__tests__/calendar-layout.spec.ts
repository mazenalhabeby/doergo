import { isoWeek, itemDays, layoutBand, layoutDay, monthGrid, startOfWeek } from "@/app/(dashboard)/calendar/_lib/layout"
import type { CalendarItem } from "@hbcfield/shared/client"

/* Where things go on the calendar grid — pure, so the week, the day and the month agree. */

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  id: Math.random().toString(36).slice(2), kind: "event", layer: "events", title: "x", start: "", end: "", allDay: false, ...over,
})
const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m).toISOString()

describe("calendar layout", () => {
  it("weeks start on Monday, months fill 6×7 from a Monday", () => {
    expect(startOfWeek(new Date(2026, 10, 1)).getDay()).toBe(1) // Sunday 1 Nov → Monday 26 Oct
    expect(startOfWeek(new Date(2026, 10, 1)).getDate()).toBe(26)
    const g = monthGrid(new Date(2026, 9, 15))
    expect(g).toHaveLength(42)
    expect(g[0]!.getDay()).toBe(1)
  })

  it("ISO week numbers", () => {
    expect(isoWeek(new Date(2026, 9, 27))).toBe(44)
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53)
  })

  it("an all-day bar spans its days and is clipped to the window", () => {
    expect(itemDays(item({ allDay: true, start: "2026-10-24", end: "2026-10-28" }), "2026-10-26", "2026-11-01")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"])
  })

  it("bars that overlap go in separate lanes; ones that don't share a lane", () => {
    const keys = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]
    const { bars, lanes } = layoutBand([
      item({ allDay: true, start: "2026-10-26", end: "2026-10-30" }),
      item({ allDay: true, start: "2026-10-27", end: "2026-10-27" }),
      item({ allDay: true, start: "2026-10-29", end: "2026-10-29" }),
    ], keys)
    expect(lanes).toBe(2)
    expect(bars.map((b) => [b.col, b.span, b.lane])).toEqual([[0, 5, 0], [1, 1, 1], [3, 1, 1]])
  })

  it("two overlapping meetings sit side by side; a later one gets the full width", () => {
    const placed = layoutDay([
      item({ start: at(9), end: at(10) }),
      item({ start: at(9, 30), end: at(10, 30) }),
      item({ start: at(14), end: at(15) }),
    ], "2026-10-27")
    expect(placed.map((p) => [p.col, p.cols])).toEqual([[0, 2], [1, 2], [0, 1]])
    expect(placed[0]!.top).toBe(9 * 48)
  })
})
