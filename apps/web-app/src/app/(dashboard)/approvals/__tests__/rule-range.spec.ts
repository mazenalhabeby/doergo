import { pickRule, type ApprovalRuleView } from "@hbcfield/shared/client"
import { ruleRanges } from "../_lib/rule-range"

const rule = (id: string, spaceId: string | null, minMinutes: number | null, extra: Partial<ApprovalRuleView> = {}) =>
  ({
    id,
    kind: "overtime",
    spaceId,
    minMinutes,
    minDays: null,
    minAmountCents: null,
    whenCoverShort: false,
    secondRoleId: "r",
    remindAfterHours: null,
    escalateAfterHours: null,
    escalateRoleId: null,
    isActive: true,
    ...extra,
  }) as ApprovalRuleView

const NAMES: Record<string, string> = { billa: "BILLA AG", main: "Main Office" }
const name = (id: string) => NAMES[id] ?? id

describe("ruleRanges — what each rule really covers", () => {
  const rules = [rule("1", "billa", null), rule("2", "billa", 120), rule("3", "main", null), rule("4", null, null)]
  const [r1, r2, r3, r4] = ruleRanges(rules, name)

  it("a rule stops where a higher limit in the same workspace starts", () => {
    expect(r1).toMatchObject({ from: null, to: 120 })
    expect(r2).toMatchObject({ from: 120, to: null })
    expect(r3).toMatchObject({ from: null, to: null, notIn: [] })
  })

  it("an every-workspace rule names the workspaces whose own rules replace it", () => {
    expect(r4.notIn).toEqual(["BILLA AG", "Main Office"])
  })

  it("agrees with the server's choice at every edge", () => {
    for (const [space, minutes, want] of [
      ["billa", 60, "1"],
      ["billa", 120, "1"],
      ["billa", 121, "2"],
      ["main", 500, "3"],
      ["omv", 30, "4"],
    ] as const)
      expect(pickRule(rules, { spaceIds: [space], minutes })?.id).toBe(want)
  })

  it("a later twin with the same place and limit is never used; switched-off rules do not cut a range", () => {
    const [a, b] = ruleRanges([rule("a", null, 60), rule("b", null, 60)], name)
    expect(a.shadowedBy).toBeNull()
    expect(b.shadowedBy).toBe(1)
    const [c] = ruleRanges([rule("c", null, null), rule("d", null, 60, { isActive: false })], name)
    expect(c.to).toBeNull()
  })
})
