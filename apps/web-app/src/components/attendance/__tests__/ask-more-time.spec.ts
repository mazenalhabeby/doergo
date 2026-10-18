import { mayAskMoreTime } from "../ask-more-time-rule"

/* "Ask for more time" appears once the planned end has passed, and never twice. */
describe("ask for more time", () => {
  const now = new Date("2026-10-16T15:00:00Z").getTime()
  it("only past the planned end", () => {
    expect(mayAskMoreTime({ expectedClockOutAt: "2026-10-16T14:30:00Z", reminderState: "NONE" }, now)).toBe(true)
    expect(mayAskMoreTime({ expectedClockOutAt: "2026-10-16T16:30:00Z", reminderState: "NONE" }, now)).toBe(false)
  })
  it("not without a planned end, nor while a request waits or was given", () => {
    expect(mayAskMoreTime({ expectedClockOutAt: null, reminderState: "NONE" }, now)).toBe(false)
    expect(mayAskMoreTime({ expectedClockOutAt: "2026-10-16T14:30:00Z", reminderState: "OVERTIME_PENDING" }, now)).toBe(
      false,
    )
    expect(
      mayAskMoreTime({ expectedClockOutAt: "2026-10-16T14:30:00Z", reminderState: "OVERTIME_APPROVED" }, now),
    ).toBe(false)
  })
})
