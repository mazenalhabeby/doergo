import { daysOverdue, bandFor, summarise, byUrgency, isOutstanding } from "../_lib/aging"

/**
 * The invoice list reported how many invoices were overdue and nothing else, so
 * one five days late and one four months late looked identical. They are not
 * the same problem — the first is a reminder, the second is a phone call — and
 * every accounts-receivable practice is built on that distinction.
 */
describe("invoice ageing", () => {
  const NOW = new Date("2026-08-27T12:00:00Z")
  const inv = (over: Partial<any>) =>
    ({ id: "i", status: "SENT", total: 100, dueDate: "2026-08-27", ...over }) as any

  describe("days overdue", () => {
    it("counts whole days, ignoring the time of day", () => {
      // Both sides are floored to a date, so an invoice due today is 0 days
      // overdue at 09:00 and at 23:00 — not 0 and then 1.
      expect(daysOverdue("2026-08-27", NOW)).toBe(0)
      expect(daysOverdue("2026-08-20", NOW)).toBe(7)
    })

    it("is negative before the due date", () => {
      expect(daysOverdue("2026-09-10", NOW)).toBe(-14)
    })

    it("returns null for an invoice with no due date", () => {
      expect(daysOverdue(null, NOW)).toBeNull()
      expect(daysOverdue(undefined, NOW)).toBeNull()
    })
  })

  describe("bands follow the accountant's 30/60/90", () => {
    it("treats due-today as current, not overdue", () => {
      // Chasing someone on the morning it falls due is how you annoy a client
      // who is not actually late.
      expect(bandFor(0)).toBe("current")
      expect(bandFor(-5)).toBe("current")
    })
    it("splits at the boundaries the report uses", () => {
      expect(bandFor(1)).toBe("d1_30")
      expect(bandFor(30)).toBe("d1_30")
      expect(bandFor(31)).toBe("d31_60")
      expect(bandFor(60)).toBe("d31_60")
      expect(bandFor(61)).toBe("d61_90")
      expect(bandFor(90)).toBe("d61_90")
      expect(bandFor(91)).toBe("d90_plus")
    })
    it("treats a missing due date as current rather than ancient", () => {
      expect(bandFor(null)).toBe("current")
    })
  })

  describe("only unpaid invoices age", () => {
    it("counts SENT and OVERDUE", () => {
      expect(isOutstanding({ status: "SENT" } as any)).toBe(true)
      expect(isOutstanding({ status: "OVERDUE" } as any)).toBe(true)
    })
    it("excludes settled ones", () => {
      // Counting a paid invoice would inflate the very figure someone uses to
      // decide who to chase today.
      for (const s of ["PAID", "DRAFT", "CANCELED"]) {
        expect(isOutstanding({ status: s } as any)).toBe(false)
      }
    })
  })

  describe("summary", () => {
    const rows = [
      inv({ id: "a", dueDate: "2026-08-20", total: 100 }),  // 7 days   → 1-30
      inv({ id: "b", dueDate: "2026-07-10", total: 200 }),  // 48 days  → 31-60
      inv({ id: "c", dueDate: "2026-01-01", total: 400 }),  // 238 days → 90+
      inv({ id: "d", dueDate: "2026-09-30", total: 50 }),   // not due  → current
      inv({ id: "e", dueDate: "2026-01-01", total: 999, status: "PAID" }),
    ]

    it("totals only what is still owed", () => {
      const s = summarise(rows, NOW)
      expect(s.outstanding).toBe(350 + 400 - 0) // 100+200+400+50
      expect(s.outstandingCount).toBe(4)
    })

    it("separates overdue from merely outstanding", () => {
      const s = summarise(rows, NOW)
      expect(s.overdue).toBe(700)   // the 50 not yet due is excluded
      expect(s.overdueCount).toBe(3)
    })

    it("places each invoice in one band only", () => {
      const s = summarise(rows, NOW)
      expect(s.bands.current.count).toBe(1)
      expect(s.bands.d1_30.count).toBe(1)
      expect(s.bands.d31_60.count).toBe(1)
      expect(s.bands.d90_plus.count).toBe(1)
      const total = Object.values(s.bands).reduce((n, b) => n + b.count, 0)
      expect(total).toBe(s.outstandingCount)
    })

    it("reports the oldest debt, which is the one that decides the action", () => {
      expect(summarise(rows, NOW).oldestDays).toBe(238)
    })

    it("says nothing is overdue when nothing is", () => {
      const s = summarise([inv({ dueDate: "2026-09-30" })], NOW)
      expect(s.overdueCount).toBe(0)
      expect(s.oldestDays).toBeNull()
    })
  })

  describe("urgency ordering", () => {
    it("puts the longest overdue first", () => {
      const rows = [inv({ id: "new", dueDate: "2026-08-26" }), inv({ id: "old", dueDate: "2026-01-01" })]
      expect([...rows].sort((a, b) => byUrgency(a, b, NOW))[0].id).toBe("old")
    })

    it("sinks settled invoices below everything owed", () => {
      const rows = [
        inv({ id: "paid", dueDate: "2026-01-01", status: "PAID" }),
        inv({ id: "owed", dueDate: "2026-09-30" }),
      ]
      // Even though the paid one is far older, it needs no action at all.
      expect([...rows].sort((a, b) => byUrgency(a, b, NOW))[0].id).toBe("owed")
    })
  })
})
