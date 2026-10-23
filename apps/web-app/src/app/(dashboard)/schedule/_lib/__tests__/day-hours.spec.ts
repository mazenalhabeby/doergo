/**
 * "Change hours for this day": the form refuses exactly what the server's shared parser refuses.
 */
import { checkDayHours, shiftTime, spanMinutes } from "../day-hours"

describe("checkDayHours", () => {
  it("a day", () => {
    expect(checkDayHours("2026-10-23", "07:00", "16:00")).toEqual({ ok: true, minutes: 540, night: false })
  })

  it("a night ends the next morning", () => {
    expect(checkDayHours("2026-10-24", "18:00", "06:00")).toEqual({ ok: true, minutes: 720, night: true })
    expect(checkDayHours("2026-10-24", "14:00", "06:00")).toEqual({ ok: true, minutes: 960, night: true })
  })

  it("refuses the same time, a night past 16 hours, and an empty time", () => {
    expect(checkDayHours("2026-10-24", "08:00", "08:00")).toEqual({ ok: false, why: "SAME" })
    expect(checkDayHours("2026-10-24", "14:00", "09:00")).toEqual({ ok: false, why: "TOO_LONG", minutes: 1140 })
    expect(checkDayHours("2026-10-24", "", "09:00")).toEqual({ ok: false, why: "MISSING" })
  })
})

describe("time arithmetic", () => {
  it("moves a time round midnight", () => {
    expect(shiftTime("00:30", -60)).toBe("23:30")
    expect(shiftTime("23:30", 60)).toBe("00:30")
    expect(spanMinutes("22:00", "02:00")).toBe(240)
  })
})
