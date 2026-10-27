import type { TFunction } from "i18next"
import type { ApprovalItem, ApprovalRuleView } from "@hbcfield/shared/client"
import { durationFields, durationValue, limitInput, limitMax, limitPatch, limitText } from "../_lib/rule-limit"
import { ruleLinkForItem } from "../_lib/rule-link"

/*
  A rule's limit typed and read back: a duration (overtime, hours changed by hand) is hours + minutes and
  round-trips to the minute — decimal hours turned 50 min into "0.8 h" and saved it again as 48.
*/

const t = ((key: string, o?: Record<string, unknown>) =>
  key === "requests.duration.hoursMinutes"
    ? `${o?.h} h ${o?.m} min`
    : key === "requests.duration.hours"
      ? `${o?.h} h`
      : key === "requests.duration.minutes"
        ? `${o?.m} min`
        : key) as unknown as TFunction

const rule = (kind: ApprovalRuleView["kind"], extra: Partial<ApprovalRuleView>) =>
  ({ kind, minMinutes: null, minDays: null, minAmountCents: null, ...extra }) as ApprovalRuleView

describe("a duration limit — hours and minutes", () => {
  it("50 min reads as 50 min and saves back as 50", () => {
    const typed = limitInput(rule("overtime", { minMinutes: 50 }))
    expect(durationFields(typed)).toEqual({ h: "0", m: "50" })
    expect(limitPatch("overtime", durationValue("0", "50"))).toEqual({
      minMinutes: 50,
      minDays: null,
      minAmountCents: null,
    })
    expect(limitText(t, "overtime", 50, "EUR")).toBe("50 min")
  })

  it("every stored minute round-trips exactly, for overtime and changed hours", () => {
    for (const kind of ["overtime", "hours"] as const)
      for (const n of [1, 29, 59, 60, 61, 90, 125, 1439, 1440]) {
        const { h, m } = durationFields(limitInput(rule(kind, { minMinutes: n })))
        expect(limitPatch(kind, durationValue(h, m)).minMinutes).toBe(n)
      }
  })

  it("is read as hours and minutes", () => {
    expect(limitText(t, "overtime", 90, "EUR")).toBe("1 h 30 min")
    expect(limitText(t, "hours", 120, "EUR")).toBe("2 h")
    expect(limitText(t, "hours", 15, "EUR")).toBe("15 min")
  })

  it("both fields empty is no limit; one empty field counts as 0", () => {
    expect(durationValue("", "")).toBe("")
    expect(limitPatch("overtime", durationValue("", "")).minMinutes).toBeNull()
    expect(durationValue("2", "")).toBe("120")
    expect(durationValue("", "45")).toBe("45")
    expect(durationFields("")).toEqual({ h: "", m: "" })
  })

  it("is capped at the kind's ceiling, in minutes", () => {
    expect(limitMax("overtime")).toBe(1440)
    expect(limitPatch("overtime", durationValue("30", "0")).minMinutes).toBe(1440)
  })

  it("other kinds keep their own unit", () => {
    expect(limitInput(rule("expense", { minAmountCents: 1250 }))).toBe("12.5")
    expect(limitPatch("expense", "12.5").minAmountCents).toBe(1250)
    expect(limitPatch("request", "3").minDays).toBe(3)
  })
})

describe("make a rule like this", () => {
  const item = (data: Record<string, unknown>): ApprovalItem =>
    ({
      kind: "overtime",
      id: "x",
      subject: { id: "u", name: "Ana", avatarUrl: null },
      space: { id: "s1", name: "BILLA" },
      raisedAt: null,
      dueAt: null,
      group: "LATER",
      canDecide: true,
      data,
    }) as ApprovalItem
  const limitOf = (link: string | null) => new URLSearchParams(link?.split("?")[1]).get("limit")

  it("a limit just under the item's own value", () => {
    expect(limitOf(ruleLinkForItem(item({ requestedMinutes: 90 })))).toBe("60")
  })
  it("a limit that rounds to nothing sends none — the rule is for every one", () => {
    expect(limitOf(ruleLinkForItem(item({ requestedMinutes: 20 })))).toBeNull()
    expect(ruleLinkForItem(item({ requestedMinutes: 20 }))).toContain("space=s1")
  })
})
