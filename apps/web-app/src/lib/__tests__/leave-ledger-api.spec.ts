import { toLeaveLedger, toLeaveOpening, toOpeningMatch, unwrapBody } from "../api/leave-ledger"

/*
  The ledger's responses, read into ONE shape whatever envelope the server used —
  so a screen never branches on the server's version, and an early server that
  answered with a bare array still renders (read-only).
*/

describe("unwrapBody", () => {
  it("takes `data` out of an envelope and leaves a bare body alone", () => {
    expect(unwrapBody({ success: true, data: [1] })).toEqual([1])
    expect(unwrapBody({ items: [] })).toEqual({ items: [] })
    expect(unwrapBody(null)).toBeNull()
  })
})

describe("toLeaveLedger", () => {
  const item = { id: "a1", kind: "OPENING_USED", days: -10, leaveYearStart: "2026-01-01", reason: null, createdAt: "2026-08-01T09:00:00Z", createdBy: null, voidedAt: null }

  it("reads the server's { leaveYear, items, canEdit }", () => {
    const l = toLeaveLedger({ leaveYear: { start: "2026-01-01", end: "2026-12-31", mode: "CALENDAR" }, items: [item], canEdit: true })
    expect(l.items).toHaveLength(1)
    expect(l.canEdit).toBe(true)
    expect(l.leaveYear?.mode).toBe("CALENDAR")
  })

  it("a bare array is the lines, never editable — the server did not say the caller may", () => {
    expect(toLeaveLedger([item])).toEqual({ leaveYear: null, items: [item], canEdit: false })
  })

  it("anything unreadable is an empty, read-only ledger", () => {
    expect(toLeaveLedger(undefined)).toEqual({ leaveYear: null, items: [], canEdit: false })
    expect(toLeaveLedger({ canEdit: "yes" }).canEdit).toBe(false)
  })
})

describe("toLeaveOpening", () => {
  const row = { userId: "u1", firstName: "Mark", lastName: "Weber", email: "m@x", used: 10, carried: 0 }
  it("reads rows, the start day and the mode", () => {
    expect(toLeaveOpening({ on: "2026-08-01", trackingStartedOn: null, mode: "WORK_YEAR", rows: [row] })).toEqual({ rows: [row], trackingStartedOn: null, mode: "WORK_YEAR" })
  })
  it("a bare array is the rows, with no start day known", () => {
    expect(toLeaveOpening([row])).toEqual({ rows: [row] })
  })
})

describe("toOpeningMatch", () => {
  it("turns the server's matches into rows the table can fill, named by the server", () => {
    const m = toOpeningMatch({
      matched: [{ line: 2, person: "mark@x", userId: "u1", firstName: "Mark", lastName: "Weber", email: "mark@x", used: 10, carried: 0, by: "EMAIL" }],
      unmatched: [{ line: 3, person: "Nobody Here", used: 1, carried: 0, reason: "NOT_FOUND" }],
      errors: [{ line: 4, text: "Sarah; ten" }],
    })
    expect(m.rows).toEqual([{ line: 2, userId: "u1", name: "Mark Weber", used: 10, carried: 0 }])
    expect(m.unmatched).toEqual([{ line: 3, text: "Nobody Here", reason: "NOT_FOUND" }])
    expect(m.errors).toEqual([{ line: 4, text: "Sarah; ten" }])
  })

  it("a match without a user id is dropped — an id is never invented", () => {
    expect(toOpeningMatch({ matched: [{ line: 1, used: 2, carried: 0 }] }).rows).toEqual([])
  })
})
