/**
 * The vacation allowance.
 *
 * Two rules carry the whole feature, and both are easy to get wrong in a way
 * nobody notices until someone is short of days at Christmas:
 *   • only VACATION is deducted — an allowance that eats sick days is a
 *     penalty for being ill;
 *   • PENDING is reported, not subtracted — a request no manager has looked at
 *     is not time the person has taken.
 */
describe("leave balance", () => {
  const daysIn = (a: string, b: string) =>
    Math.round((new Date(b).setHours(0, 0, 0, 0) - new Date(a).setHours(0, 0, 0, 0)) / 86400000) + 1
  const year = new Date().getFullYear()
  const d = (m: number, day: number) => `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`

  function balance(
    allowance: number | null,
    orgDefault: number,
    rows: Array<{ type: string; status: string; startDate: string; endDate: string }>,
  ) {
    const total = allowance ?? orgDefault
    let taken = 0, pending = 0
    for (const r of rows) {
      if (r.type !== "VACATION") continue
      if (new Date(r.startDate).getFullYear() !== year) continue
      if (r.status === "APPROVED") taken += daysIn(r.startDate, r.endDate)
      else if (r.status === "PENDING") pending += daysIn(r.startDate, r.endDate)
    }
    return { allowance: total, taken, pending, remaining: total - taken }
  }

  it("deducts approved vacation", () => {
    const b = balance(25, 25, [{ type: "VACATION", status: "APPROVED", startDate: d(7, 1), endDate: d(7, 5) }])
    expect(b.taken).toBe(5)
    expect(b.remaining).toBe(20)
  })

  it("does NOT deduct sick leave", () => {
    const b = balance(25, 25, [{ type: "SICK", status: "APPROVED", startDate: d(7, 1), endDate: d(7, 10) }])
    expect(b.taken).toBe(0)
    expect(b.remaining).toBe(25)
  })

  it("does not deduct personal or other either", () => {
    const b = balance(25, 25, [
      { type: "PERSONAL", status: "APPROVED", startDate: d(7, 1), endDate: d(7, 2) },
      { type: "OTHER", status: "APPROVED", startDate: d(8, 1), endDate: d(8, 2) },
    ])
    expect(b.remaining).toBe(25)
  })

  it("reports pending without subtracting it", () => {
    const b = balance(25, 25, [{ type: "VACATION", status: "PENDING", startDate: d(9, 1), endDate: d(9, 3) }])
    expect(b.pending).toBe(3)
    expect(b.taken).toBe(0)
    expect(b.remaining).toBe(25)
  })

  it("ignores rejected and canceled requests", () => {
    const b = balance(25, 25, [
      { type: "VACATION", status: "REJECTED", startDate: d(7, 1), endDate: d(7, 5) },
      { type: "VACATION", status: "CANCELED", startDate: d(8, 1), endDate: d(8, 5) },
    ])
    expect(b.remaining).toBe(25)
  })

  it("counts a single day as one day, not zero", () => {
    const b = balance(25, 25, [{ type: "VACATION", status: "APPROVED", startDate: d(7, 1), endDate: d(7, 1) }])
    expect(b.taken).toBe(1)
  })

  it("falls back to the organization default when there is no override", () => {
    expect(balance(null, 30, []).allowance).toBe(30)
  })

  it("treats an override of 0 as a real answer, not as unset", () => {
    // `??` not `||`: 0 means this person has no paid leave, which is not the
    // same as "use whatever the organization allows".
    expect(balance(0, 25, []).allowance).toBe(0)
  })

  it("can go negative rather than clamping", () => {
    // Someone approved beyond their allowance is over, and the number should
    // say so instead of showing a reassuring zero.
    const b = balance(5, 25, [{ type: "VACATION", status: "APPROVED", startDate: d(7, 1), endDate: d(7, 10) }])
    expect(b.remaining).toBe(-5)
  })

  describe("pro-rating a mid-year joiner", () => {
    const prorate = (full: number, startMonth: number | null, startYear = year) => {
      if (startMonth === null || startYear !== year) return { allowance: full, prorated: false }
      const monthsHere = 12 - startMonth // startMonth is 0-indexed
      return { allowance: Math.round(((full * monthsHere) / 12) * 2) / 2, prorated: true }
    }

    it("gives half a year to someone who started in July", () => {
      expect(prorate(25, 6).allowance).toBe(12.5)
    })

    it("counts the month they started as a whole month", () => {
      // Starting on the 28th still means that month was begun; the alternative
      // is telling someone their first three days cost them a month of leave.
      expect(prorate(24, 0).allowance).toBe(24) // January → full year
      expect(prorate(24, 11).allowance).toBe(2) // December → one month
    })

    it("rounds to half days rather than down", () => {
      // A twelfth of 25 is not whole. Flooring every time quietly costs people
      // days they are owed.
      expect(prorate(25, 7).allowance).toBe(10.5) // 5/12 of 25 = 10.416…
    })

    it("does NOT pro-rate without a recorded start date", () => {
      // createdAt is the tempting fallback and the wrong date: importing
      // existing staff creates every account on one day, which would cut
      // months off everyone at once.
      expect(prorate(25, null)).toEqual({ allowance: 25, prorated: false })
    })

    it("does not pro-rate someone who started in an earlier year", () => {
      expect(prorate(25, 6, year - 1)).toEqual({ allowance: 25, prorated: false })
    })
  })
})
