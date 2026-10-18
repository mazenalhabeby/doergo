import {
  LABEL_CODES,
  LABEL_CATALOGUE,
  LABEL_WORDS,
  INFORMATIONAL_FLAGS,
  approvalWord,
  explainLabel,
  labelWord,
  sortedLabels,
  type LabelFacts,
} from "@hbcfield/shared/client"

/**
 * The attendance labels' one catalogue (packages/shared/src/attendance/labels):
 * every code has a place, a colour and words in all five languages; review or
 * info is the server's own rule; explanations come only from saved facts and
 * always give durations as hours and minutes.
 */

const LOCALES = ["en", "de", "es", "fr", "it"] as const

const facts = (over: Partial<LabelFacts> = {}): LabelFacts => ({
  shift: {
    id: "s1",
    name: "Night shift",
    expectedStartAt: "2026-10-06T22:00:00.000Z",
    expectedEndAt: "2026-10-07T10:00:00.000Z",
    toleranceMin: 10,
    endIsDailyLimit: false,
  },
  firstOfShift: true,
  clockIn: { judged: true, metresOutside: 0, accuracyM: 12 },
  ...over,
})

describe("label catalogue", () => {
  it("places every code the contract names, in a unique order", () => {
    for (const code of LABEL_CODES) expect(LABEL_CATALOGUE[code]).toBeDefined()
    const orders = LABEL_CODES.map((c) => LABEL_CATALOGUE[c].order)
    expect(new Set(orders).size).toBe(LABEL_CODES.length)
  })

  it("reads review or info from the server rule, not a copy of it", () => {
    for (const code of LABEL_CODES) {
      expect(LABEL_CATALOGUE[code].kind).toBe(INFORMATIONAL_FLAGS.has(code) ? "info" : "review")
    }
    expect(LABEL_CATALOGUE.LATE_FROM_REST.kind).toBe("review")
  })

  it("has every label, approval state and explanation in all five languages", () => {
    for (const l of LOCALES) {
      for (const code of LABEL_CODES) expect(LABEL_WORDS[l].label[code]).toBeTruthy()
      for (const w of Object.values(LABEL_WORDS[l].approval)) expect(w).toBeTruthy()
      expect(Object.keys(LABEL_WORDS[l].explain)).toEqual(Object.keys(LABEL_WORDS.en.explain))
      expect(Object.keys(LABEL_WORDS[l].explain.closed)).toEqual(Object.keys(LABEL_WORDS.en.explain.closed))
    }
  })

  it("sorts by the catalogue whatever order the server stored, and keeps an unknown code last", () => {
    const a = sortedLabels(["UNSCHEDULED_DAY", "SOMETHING_NEW", "LATE_ARRIVAL", "MISSED_CLOCK_OUT", "LATE_ARRIVAL"])
    expect(a.map((l) => l.code)).toEqual(["MISSED_CLOCK_OUT", "LATE_ARRIVAL", "UNSCHEDULED_DAY", "SOMETHING_NEW"])
    expect(labelWord("SOMETHING_NEW", "en")).toBe("Something new")
  })

  it("reads a region locale and falls back to English", () => {
    expect(labelWord("LATE_ARRIVAL", "de-AT")).toBe(LABEL_WORDS.de.label.LATE_ARRIVAL)
    expect(labelWord("LATE_ARRIVAL", "xx")).toBe("Late")
  })

  it('names where an entry stands with the same words everywhere — AUTO is auto-approved, never "AUTO"', () => {
    expect(approvalWord({ status: "CLOCKED_IN", approvalStatus: "PENDING" })).toBe("active")
    expect(approvalWord({ status: "CLOCKED_OUT", approvalStatus: "AUTO" })).toBe("autoApproved")
    expect(approvalWord({ status: "CLOCKED_OUT", approvalStatus: "PENDING" })).toBe("needsReview")
  })
})

describe("explainLabel", () => {
  const ctx = { timeZone: "America/New_York", locale: "en", clockInAt: "2026-10-06T22:15:00.000Z" }

  it("explains Late with the numbers, in the site’s own time", () => {
    expect(explainLabel("LATE_ARRIVAL", facts(), ctx)).toBe(
      "15m after the shift start · Night shift starts 18:00 · grace 10m",
    )
  })

  it("writes long durations as hours and minutes, never a pile of minutes", () => {
    const text = explainLabel("LATE_ARRIVAL", facts(), { ...ctx, clockInAt: "2026-10-07T02:48:00.000Z" })
    expect(text).toContain("4h 48m")
    expect(text).not.toMatch(/288/)
  })

  it("explains a long rest separately from a late morning", () => {
    const f = facts({ firstOfShift: false, rest: { plannedMin: 30, takenMin: 48, overMin: 8 } })
    expect(explainLabel("LATE_FROM_REST", f, ctx)).toBe("Rest of 48m, 30m planned · 8m over · grace 10m")
  })

  it("says how a shift was closed, and when a position was not judged", () => {
    const f = facts({ closedHow: "LEFT_SITE", clockOut: { judged: false, notJudgedBecause: "TOO_COARSE" } })
    const out = { ...ctx, clockOutAt: "2026-10-07T10:42:00.000Z" }
    expect(explainLabel("MISSED_CLOCK_OUT", f, out)).toBe("Closed at 06:42, when they were seen leaving the site")
    expect(explainLabel("OUTSIDE_GEOFENCE_OUT", f, out)).toBe("Not checked: the position was too imprecise")
  })

  it("gives a distance, never a coordinate", () => {
    const f = facts({ clockIn: { judged: true, metresOutside: 640, accuracyM: 12 } })
    const text = explainLabel("OUTSIDE_GEOFENCE_IN", f, ctx) ?? ""
    // The distance formatter joins number and unit with a no-break space.
    expect(text.replace(/\u00a0/g, " ")).toBe("640 m outside the site · GPS accuracy 12 m")
    expect(text).not.toMatch(/\d+\.\d{4,}/)
  })

  it("returns nothing for an entry from before the rules — the past keeps its chip without a reason", () => {
    expect(explainLabel("LATE_ARRIVAL", null, ctx)).toBeNull()
    expect(explainLabel("LATE_ARRIVAL", undefined, ctx)).toBeNull()
  })

  it("speaks the reader’s language", () => {
    expect(explainLabel("LATE_ARRIVAL", facts(), { ...ctx, locale: "de" })).toContain("nach Schichtbeginn")
  })
})
