import { requiredRoleIds, type ApprovalRuleView } from "@hbcfield/shared/client"
import { fallThrough, ruleRanges } from "../_lib/rule-range"

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
    categoryId: null,
    urgentOnly: false,
    isActive: true,
    ...extra,
  }) as ApprovalRuleView

/*
  Decision A (2026-10-27): every rule that fits applies — a rule covers its whole range on its own, and the
  page says which other rules meet it on some items (their approvers are needed too).
*/
describe("ruleRanges — every rule that fits applies", () => {
  it("a rule covers from its limit with no end, and names the rules that apply alongside", () => {
    const rules = [
      rule("1", "billa", null, { secondRoleId: "lead" }),
      rule("2", "billa", 120, { secondRoleId: "hr" }),
      rule("3", "main", null),
      rule("4", null, null, { secondRoleId: "admin" }),
    ]
    const [r1, r2, r3, r4] = ruleRanges(rules)
    expect(r1).toEqual({ from: null, alsoWith: [2, 4], shadowedBy: null })
    expect(r2).toEqual({ from: 120, alsoWith: [1, 4], shadowedBy: null })
    expect(r3.alsoWith).toEqual([4])
    expect(r4.alsoWith).toEqual([1, 2, 3])
  })

  it("agrees with the server: every fitting rule's approver is needed", () => {
    const rules = [
      rule("site", "billa", 60, { secondRoleId: "lead" }),
      rule("org", null, 120, { secondRoleId: "admin" }),
    ]
    expect(requiredRoleIds(rules, { spaceIds: ["billa"], minutes: 180 }).sort()).toEqual(["admin", "lead"])
    expect(requiredRoleIds(rules, { spaceIds: ["omv"], minutes: 180 })).toEqual(["admin"])
    expect(ruleRanges(rules)[0].alsoWith).toEqual([2])
  })

  it("the same rule twice adds nothing; with another approver it is not a twin, it is a second approval", () => {
    const [, b] = ruleRanges([rule("a", null, 60), rule("b", null, 60)])
    expect(b.shadowedBy).toBe(1)
    const [, c] = ruleRanges([rule("a", null, 60), rule("c", null, 60, { secondRoleId: "other" })])
    expect(c).toEqual({ from: 60, alsoWith: [1], shadowedBy: null })
  })

  it("switched-off rules, and rules for another workspace, are not alongside", () => {
    const [x] = ruleRanges([
      rule("x", "billa", null),
      rule("y", "main", null),
      rule("z", null, 60, { isActive: false }),
    ])
    expect(x.alsoWith).toEqual([])
  })
})

describe("fallThrough — where only the first approval is needed", () => {
  const spaces = [
    { id: "billa", name: "BILLA AG" },
    { id: "main", name: "Main Office" },
    { id: "omv", name: "OMV" },
  ]
  it("names workspaces with no rule, and the part under the lowest limit elsewhere", () => {
    const got = fallThrough([rule("1", "billa", 120), rule("2", "main", null)], spaces)
    expect(got).toEqual([
      { id: "billa", name: "BILLA AG", upTo: 120 },
      { id: "omv", name: "OMV", upTo: null },
    ])
  })
  it("an every-workspace rule with no limit leaves nothing", () => {
    expect(fallThrough([rule("1", null, null)], spaces)).toEqual([])
  })
  it("a rule that asks nobody more (reminders only) does not take items out of the first approval", () => {
    expect(fallThrough([rule("1", null, null, { secondRoleId: null })], spaces)).toHaveLength(3)
  })
})
