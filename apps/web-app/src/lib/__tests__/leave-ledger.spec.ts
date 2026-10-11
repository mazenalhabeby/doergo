import {
  applyOpeningMatches,
  balanceView,
  formatLineDays,
  formatSignedDays,
  leaveYearLabel,
  openingDraft,
  openingSaveRows,
  parseDaysInput,
  remainingAfter,
  todayKey,
} from "../leave-ledger"
import type { LeaveBalance } from "../api/types/employees"

const old: LeaveBalance = { year: 2026, allowance: 25, taken: 3, pending: 2, remaining: 22 }

describe("balanceView — the lines to draw", () => {
  it("uses the server's lines when it sends them (the ledger)", () => {
    const v = balanceView({
      ...old,
      remaining: 14,
      adjusted: -8,
      leaveYear: { start: "2026-01-01", end: "2026-12-31", mode: "CALENDAR" },
      lines: [
        { key: "ALLOWANCE", days: 25 },
        { key: "OPENING_USED", days: -10 },
        { key: "CARRY_OVER", days: 2 },
        { key: "TAKEN", days: -3 },
      ],
      carryExpiresOn: "2026-03-31",
    })!
    expect(v.lines.map((l) => l.key)).toEqual(["ALLOWANCE", "OPENING_USED", "CARRY_OVER", "TAKEN"])
    expect(v.remaining).toBe(14)
    expect(v.carryExpiresOn).toBe("2026-03-31")
  })

  it("an older server's allowance/taken are laid out by the shared leaveBalance — same look, fewer lines", () => {
    const v = balanceView(old)!
    expect(v.lines).toEqual([
      { key: "ALLOWANCE", days: 25 },
      { key: "TAKEN", days: -3 },
    ])
    expect(v.leaveYear).toBeNull()
    expect(v.remaining).toBe(22)
  })

  it("nothing to draw without a balance", () => {
    expect(balanceView(null)).toBeNull()
    expect(balanceView(undefined)).toBeNull()
  })
})

describe("what a request leaves", () => {
  it("subtracts in half days and goes negative honestly", () => {
    expect(remainingAfter(14, 3)).toBe(11)
    expect(remainingAfter(1, 2.5)).toBe(-1.5)
    expect(remainingAfter(5, -2)).toBe(5) // a negative cost is no cost
  })
})

describe("days as printed", () => {
  it("allowance plain, every other line signed with a true minus", () => {
    expect(formatLineDays({ key: "ALLOWANCE", days: 25 }, "en")).toBe("25")
    expect(formatLineDays({ key: "OPENING_USED", days: -10 }, "en")).toBe("−10")
    expect(formatLineDays({ key: "CARRY_OVER", days: 2 }, "en")).toBe("+2")
    expect(formatSignedDays(-1.5, "de")).toBe("−1,5")
  })
})

describe("the leave year's name", () => {
  const dm = (d: string) => d.slice(5)
  it("the calendar year by its number", () => {
    expect(leaveYearLabel({ leaveYear: { start: "2026-01-01", end: "2026-12-31", mode: "CALENDAR" }, year: 2026 }, dm)).toEqual({ kind: "calendar", year: 2026 })
  })
  it("a work year by its two ends", () => {
    expect(leaveYearLabel({ leaveYear: { start: "2026-04-15", end: "2027-04-14", mode: "WORK_YEAR" }, year: 2026 }, dm)).toEqual({ kind: "work", from: "04-15", to: "04-14" })
  })
  it("an older server: the balance's own year", () => {
    expect(leaveYearLabel({ leaveYear: null, year: 2025 }, dm)).toEqual({ kind: "calendar", year: 2025 })
  })
})

describe("starting balances — typed cells", () => {
  it("reads empty as 0, a comma as a decimal point, half days only, 0–366", () => {
    expect(parseDaysInput("")).toBe(0)
    expect(parseDaysInput(" 10 ")).toBe(10)
    expect(parseDaysInput("10,5")).toBe(10.5)
    expect(parseDaysInput("2.5")).toBe(2.5)
    expect(parseDaysInput("2.3")).toBeNull()
    expect(parseDaysInput("-1")).toBeNull()
    expect(parseDaysInput("367")).toBeNull()
    expect(parseDaysInput("ten")).toBeNull()
  })

  const server = [
    { userId: "u2", firstName: "Sarah", lastName: "Wagner", email: "sarah@x", used: 6, carried: 2 },
    { userId: "u1", firstName: "Mark", lastName: "Weber", email: "mark@x", used: 0, carried: 0 },
  ]

  it("the draft is sorted by name and shows 0 as an empty cell", () => {
    const d = openingDraft(server)
    expect(d.map((r) => r.name)).toEqual(["Mark Weber", "Sarah Wagner"])
    expect(d[0]).toMatchObject({ used: "", carried: "" })
    expect(d[1]).toMatchObject({ used: "6", carried: "2" })
  })

  it("matches fill their rows; everybody else keeps what they had", () => {
    const { draft, filled } = applyOpeningMatches(openingDraft(server), [{ userId: "u1", used: 10, carried: 0 }, { userId: "nobody", used: 1, carried: 1 }])
    expect(filled).toBe(1)
    expect(draft.find((r) => r.userId === "u1")).toMatchObject({ used: "10", carried: "" })
    expect(draft.find((r) => r.userId === "u2")).toMatchObject({ used: "6", carried: "2" })
  })

  it("Save sends every row, or names the rows it cannot read", () => {
    const d = openingDraft(server)
    expect(openingSaveRows(d)).toEqual({ ok: true, rows: [{ userId: "u1", used: 0, carried: 0 }, { userId: "u2", used: 6, carried: 2 }] })
    const bad = d.map((r) => (r.userId === "u2" ? { ...r, used: "6,3" } : r))
    expect(openingSaveRows(bad)).toEqual({ ok: false, invalid: ["u2"] })
  })
})

describe("today", () => {
  it("is a local YYYY-MM-DD", () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05")
  })
})
