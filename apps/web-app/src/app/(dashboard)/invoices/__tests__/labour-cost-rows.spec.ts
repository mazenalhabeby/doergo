import { labourCostRows } from "../_lib/labour-cost-rows"

const h = (o: object) => ({ workerId: "p", workerName: "Patrick", workRoleId: null, workRoleName: "Electric", hours: 290.25, days: 25, fromDay: "2026-09-01", toDay: "2026-09-30", hourRateCents: 9506, ...o }) as any
const d = (o: object) => ({ workerId: "p", workerName: "Patrick", workRoleId: null, workRoleName: "Electric", days: 25, fromDay: "2026-09-01", toDay: "2026-09-30", dayRateCents: 20130, hours: 280, ...o }) as any

describe("labour cost rows", () => {
  it("one row per person: hours from the hours line, days from the days line — never both", () => {
    const [r] = labourCostRows([h({ countedHours: 280, costCents: 0, costHourRateCents: null })], [d({ costCents: 400000, costDayRateCents: 16000 })])
    expect(r).toMatchObject({ name: "Patrick", hours: 280, days: 25, dayRateCents: 16000, costCents: 400000 })
  })
  it("adds the server's cost, never multiplies a rate", () => {
    const [r] = labourCostRows([h({ costCents: 1234, costHourRateCents: 3000 })], [])
    expect(r!.costCents).toBe(1234)
  })
  it("null only when no line has a cost", () => {
    const [r] = labourCostRows([h({ costCents: null })], [d({ costCents: null })])
    expect(r!.costCents).toBeNull()
  })
  it("costs a client invoice's jobs by the hour; day-billed jobs are listed, not costed", () => {
    const rows = labourCostRows([], [], [
      { include: true, workerId: "a", workerName: "Ann", hours: 2, billBy: "HOUR", costRateCents: 3000 },
      { include: true, workerId: "b", workerName: "Ben", hours: 3, billBy: "DAY", costRateCents: 3000 },
      { include: false, workerId: "c", workerName: "Cy", hours: 3, billBy: "HOUR", costRateCents: 3000 },
    ])
    expect(rows.map((r) => [r.name, r.hours, r.costCents])).toEqual([["Ann", 2, 6000], ["Ben", 3, null]])
  })
})
