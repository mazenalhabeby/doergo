import { monthBounds, periodQuery } from "../period-picker"

/*
  The service period: every choice stands for real dates, and the dates sent
  to the server are the dates the screen shows.
*/
describe("period picker", () => {
  it("builds whole months from LOCAL parts, February and the 31st included", () => {
    const now = new Date(2026, 2, 15) // 15 Mar 2026
    expect(monthBounds(-1, now)).toEqual(["2026-02-01", "2026-02-28"])
    expect(monthBounds(0, now)).toEqual(["2026-03-01", "2026-03-31"])
    expect(monthBounds(-3, new Date(2026, 0, 31))).toEqual(["2025-10-01", "2025-10-31"])
  })

  it("asks the server for the days on screen", () => {
    expect(periodQuery({ mode: "custom", from: "2026-09-03", to: "2026-09-20" })).toEqual({ from: "2026-09-03", to: "2026-09-20" })
    const [f, t] = monthBounds(-1)
    expect(periodQuery({ mode: "last", from: "", to: "" })).toEqual({ from: f, to: t })
  })
})
