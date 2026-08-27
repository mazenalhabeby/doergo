import { msLeft, formatCountdown, urgencyOf, shiftLength, isLongShift } from "../_lib/countdown"

/**
 * The overtime card showed when a request ARRIVED, never how long was left to
 * answer it. A request that expires unanswered costs the technician their
 * overtime and leaves the job unresolved, so the deadline is the fact that
 * matters — and it is the one the screen was not showing.
 */
describe("approval countdown", () => {
  const NOW = new Date("2026-08-28T10:00:00Z").getTime()

  it("counts down to the deadline", () => {
    expect(msLeft("2026-08-28T10:06:00Z", NOW)).toBe(6 * 60_000)
  })

  it("goes negative once passed, rather than clamping", () => {
    // The caller decides what an expired request looks like; the maths should
    // not quietly pretend it is still live.
    expect(msLeft("2026-08-28T09:58:00Z", NOW)).toBe(-120_000)
  })

  it("returns null when there is no deadline", () => {
    // A settled request has none, and must not appear to be counting down.
    expect(msLeft(null, NOW)).toBeNull()
    expect(msLeft(undefined, NOW)).toBeNull()
  })

  it("formats minutes and seconds, padded", () => {
    expect(formatCountdown(364_000)).toBe("6:04")
    expect(formatCountdown(59_000)).toBe("0:59")
    expect(formatCountdown(600_000)).toBe("10:00")
  })

  it("never formats a negative as a countdown", () => {
    expect(formatCountdown(-5_000)).toBe("0:00")
  })

  describe("urgency, tuned to a ten-minute window", () => {
    it("is calm with minutes to spare", () => {
      expect(urgencyOf(9 * 60_000)).toBe("calm")
      expect(urgencyOf(3 * 60_000)).toBe("calm")
    })
    it("warns under three minutes", () => {
      expect(urgencyOf(2 * 60_000)).toBe("warning")
    })
    it("is critical under one", () => {
      expect(urgencyOf(45_000)).toBe("critical")
    })
    it("marks a passed deadline expired", () => {
      expect(urgencyOf(0)).toBe("expired")
      expect(urgencyOf(-1)).toBe("expired")
    })
    it("stays calm when there is no deadline at all", () => {
      // A settled request must not be painted as urgent.
      expect(urgencyOf(null)).toBe("calm")
    })
  })

  describe("shift context", () => {
    it("says how long they had already worked", () => {
      expect(shiftLength("2026-08-28T01:00:00Z", NOW)).toBe("9h 00m")
      expect(shiftLength("2026-08-28T09:30:00Z", NOW)).toBe("30m")
    })

    it("flags a shift already at the daily maximum", () => {
      // Ten hours is the Austrian daily limit. Adding an hour to a seven-hour
      // day and adding one to an eleven-hour day are different decisions, and
      // the approver should not have to do the arithmetic.
      expect(isLongShift("2026-08-28T00:00:00Z", NOW)).toBe(true)   // 10h
      expect(isLongShift("2026-08-28T03:00:00Z", NOW)).toBe(false)  // 7h
    })

    it("says nothing when the shift is unknown", () => {
      expect(shiftLength(null, NOW)).toBeNull()
      expect(isLongShift(null, NOW)).toBe(false)
    })
  })
})
