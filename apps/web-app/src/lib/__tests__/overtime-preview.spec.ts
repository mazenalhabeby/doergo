import { canAddOvertime, overtimePreview } from "../overtime-preview"
import type { TimeEntry } from "../api"

const entry = (over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: "e1",
    status: "CLOCKED_OUT",
    clockInAt: "2026-09-14T06:00:00.000Z",
    expectedClockOutAt: "2026-09-14T15:00:00.000Z",
    clockOutAt: "2026-09-14T16:40:00.000Z",
    paidMinutes: 510,
    flagReasons: [],
    ...over,
  }) as TimeEntry

describe("overtime on a closed shift", () => {
  it("suggests the time the member actually stayed", () => {
    expect(overtimePreview(entry(), 0)?.pastEnd).toBe(100)
    expect(overtimePreview(entry(), 0)?.suggested).toBe(100)
  })

  it("counts from the shift end, and adds the minutes to counted time", () => {
    const p = overtimePreview(entry(), 90)!
    expect(p.countedUntil.toISOString()).toBe("2026-09-14T16:30:00.000Z")
    expect(p.countedAfter).toBe(600)
  })

  it("never counts past the clock-out", () => {
    const p = overtimePreview(entry(), 240)!
    expect(p.countedUntil.toISOString()).toBe("2026-09-14T16:40:00.000Z")
    expect(p.countedAfter).toBe(610)
  })

  it("is offered only on a closed shift that had a planned end", () => {
    expect(canAddOvertime(entry({ status: "CLOCKED_IN" as TimeEntry["status"], clockOutAt: null }))).toBe(false)
    expect(canAddOvertime(entry({ expectedClockOutAt: null }))).toBe(false)
    expect(overtimePreview(entry({ expectedClockOutAt: null }), 30)).toBeNull()
  })
})
