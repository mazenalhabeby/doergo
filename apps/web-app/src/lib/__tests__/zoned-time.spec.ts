import { utcToZonedInput, zonedInputToUtc } from "@hbcfield/shared/client"

/**
 * Correcting a shift in the SPACE's zone, not the editor's.
 *
 * The conversion moved into `@hbcfield/shared` when the mobile attendance
 * editor needed it: a supervisor in Vienna fixing a crew's hours in Helsinki
 * types the times the crew worked, and both clients must agree to the minute.
 * A second copy of DST-aware arithmetic drifts by exactly one hour, twice a
 * year, and the number it moves is somebody's pay.
 */

describe("wall clock ↔ instant", () => {
  it("shows an instant as the wall clock of the given zone", () => {
    // 06:00 UTC is 08:00 in Berlin in August (CEST, +2).
    expect(utcToZonedInput("2026-08-05T06:00:00.000Z", "Europe/Berlin")).toBe("2026-08-05T08:00")
    // …and 02:00 in New York (EDT, −4) on the same instant.
    expect(utcToZonedInput("2026-08-05T06:00:00.000Z", "America/New_York")).toBe("2026-08-05T02:00")
  })

  it("reads a typed wall clock as belonging to that zone", () => {
    expect(zonedInputToUtc("2026-08-05T08:00", "Europe/Berlin")).toBe("2026-08-05T06:00:00.000Z")
  })

  it("round-trips — what is shown, retyped unchanged, is the same instant", () => {
    const iso = "2026-01-15T23:44:00.000Z"
    for (const tz of ["Europe/Vienna", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"]) {
      expect(zonedInputToUtc(utcToZonedInput(iso, tz), tz)).toBe(iso)
    }
  })

  it("uses the winter offset in winter and the summer one in summer", () => {
    // Berlin is +1 in January and +2 in July — a fixed offset would be an hour
    // out for half the year.
    expect(zonedInputToUtc("2026-01-15T08:00", "Europe/Berlin")).toBe("2026-01-15T07:00:00.000Z")
    expect(zonedInputToUtc("2026-07-15T08:00", "Europe/Berlin")).toBe("2026-07-15T06:00:00.000Z")
  })

  it("survives the spring-forward night, where an hour does not exist", () => {
    // 02:30 on 29 March 2026 never happens in Berlin; the conversion must still
    // produce a real instant rather than NaN.
    const out = zonedInputToUtc("2026-03-29T02:30", "Europe/Berlin")
    expect(out).toMatch(/^2026-03-29T/)
    expect(Number.isNaN(new Date(out).getTime())).toBe(false)
  })

  it("survives the autumn night, where an hour happens twice", () => {
    const out = zonedInputToUtc("2026-10-25T02:30", "Europe/Berlin")
    expect(Number.isNaN(new Date(out).getTime())).toBe(false)
    // Whichever of the two 02:30s it picks, reading it back must show 02:30.
    expect(utcToZonedInput(out, "Europe/Berlin")).toBe("2026-10-25T02:30")
  })

  it("answers empty for nothing, rather than inventing a time", () => {
    expect(utcToZonedInput(null, "Europe/Berlin")).toBe("")
    expect(utcToZonedInput("not-a-date", "Europe/Berlin")).toBe("")
    expect(zonedInputToUtc("", "Europe/Berlin")).toBe("")
    expect(zonedInputToUtc("2026-08-05", "Europe/Berlin")).toBe("")
  })

  it("falls back to the device zone when no zone is given", () => {
    // Not a fixed string — it depends on where the test runs — but it must be a
    // real instant that reads back the same.
    const out = zonedInputToUtc("2026-08-05T08:00")
    expect(Number.isNaN(new Date(out).getTime())).toBe(false)
    expect(utcToZonedInput(out)).toBe("2026-08-05T08:00")
  })
})
