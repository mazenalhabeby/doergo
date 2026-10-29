import type { ApprovalRuleView } from "@hbcfield/shared/client"
import { seenRules, tryNeeds } from "../_lib/rule-view"

const rule = (id: string, spaceId: string | null, minAmountCents: number | null, role: string, extra: Partial<ApprovalRuleView> = {}) =>
  ({
    id,
    kind: "expense",
    spaceId,
    minMinutes: null,
    minDays: null,
    minAmountCents,
    whenCoverShort: false,
    secondRoleId: role,
    remindAfterHours: null,
    escalateAfterHours: null,
    escalateRoleId: null,
    categoryId: null,
    urgentOnly: false,
    isActive: true,
    ...extra,
  }) as ApprovalRuleView

// Company: over €500 → Finance. Depot: over €200 → Depot Lead. Main Office: over €1,000 → Office Manager.
const RULES = [
  rule("c1", null, 50_000, "finance"),
  rule("d1", "depot", 20_000, "depotLead"),
  rule("m1", "main", 100_000, "officeManager"),
]

describe("seen from one workspace", () => {
  it("the whole company sees every rule, as it is", () => {
    expect(seenRules(RULES, null)).toBe(RULES)
  })

  it("a workspace sees the company's rules first (locked), then only its own", () => {
    const seen = seenRules(RULES, "depot")
    expect(seen.map((r) => r.id)).toEqual(["c1", "d1"])
    expect(seen[0].editable).toBe(false)
    expect(seen[1].editable).toBeUndefined()
  })

  it("never changes the rules it was given (the cache stays as the server sent it)", () => {
    seenRules(RULES, "depot")
    expect(RULES[0].editable).toBeUndefined()
  })
})

describe("try an item — the server's reading: every rule that fits applies", () => {
  it("€800 in the Depot needs Finance AND the Depot Lead", () => {
    const r = tryNeeds(RULES, { spaceIds: ["depot"], amountCents: 80_000 })
    expect(r.roleIds).toEqual(["depotLead", "finance"])
    expect([...r.matched].sort()).toEqual(["c1", "d1"])
  })

  it("€300 in the Depot needs only the Depot Lead; in Main Office nobody else", () => {
    expect(tryNeeds(RULES, { spaceIds: ["depot"], amountCents: 30_000 }).roleIds).toEqual(["depotLead"])
    expect(tryNeeds(RULES, { spaceIds: ["main"], amountCents: 30_000 }).roleIds).toEqual([])
  })

  it("a limit is passed only when strictly MORE (€500 exactly does not reach Finance)", () => {
    expect(tryNeeds(RULES, { spaceIds: ["main"], amountCents: 50_000 }).roleIds).toEqual([])
  })

  it("a switched-off rule and another workspace's rule never apply", () => {
    const off = [rule("c1", null, 0, "finance", { isActive: false }), rule("x", "elsewhere", 0, "other")]
    expect(tryNeeds(off, { spaceIds: ["depot"], amountCents: 99_999 }).roleIds).toEqual([])
  })

  it("two rules naming the same role ask one person once", () => {
    const twice = [rule("c1", null, 0, "finance"), rule("d1", "depot", 0, "finance")]
    expect(tryNeeds(twice, { spaceIds: ["depot"], amountCents: 100 }).roleIds).toEqual(["finance"])
  })
})
