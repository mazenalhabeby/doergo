import type { TFunction } from "i18next"
import type { ApprovalItem, ApprovalRuleView } from "@hbcfield/shared/client"
import {
  durationFields,
  durationValue,
  limitCapped,
  limitInput,
  limitMax,
  limitPatch,
  limitPatchInput,
  limitText,
  readLimitNumber,
} from "../_lib/rule-limit"
import { ruleLinkForItem } from "../_lib/rule-link"

// The reader's language decides how a saved amount is shown ("12,50" / "12.50").
let mockLocale = "en"
jest.mock("@/lib/format-date", () => ({
  ...jest.requireActual("@/lib/format-date"),
  dateLocale: () => mockLocale,
}))

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
        : key === "approvals.tree.daysInARow"
          ? `${o?.count} days in a row`
          : key) as unknown as TFunction

const rule = (kind: ApprovalRuleView["kind"], extra: Partial<ApprovalRuleView>) =>
  ({ kind, minMinutes: null, minDays: null, minAmountCents: null, ...extra }) as ApprovalRuleView

describe("a duration limit — hours and minutes", () => {
  it("50 min reads as 50 min and saves back as 50", () => {
    const typed = limitInput(rule("overtime", { minMinutes: 50 }))
    expect(durationFields(typed)).toEqual({ h: "", m: "50" })
    expect(limitPatch("overtime", durationValue("0", "50")!)).toEqual({
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
        expect(limitPatch(kind, durationValue(h, m)!)?.minMinutes).toBe(n)
      }
  })

  it("is read as hours and minutes", () => {
    expect(limitText(t, "overtime", 90, "EUR")).toBe("1 h 30 min")
    expect(limitText(t, "hours", 120, "EUR")).toBe("2 h")
    expect(limitText(t, "hours", 15, "EUR")).toBe("15 min")
  })

  it("both fields empty is no limit; one empty field counts as 0", () => {
    expect(durationValue("", "")).toBe("")
    expect(limitPatch("overtime", durationValue("", "")!)?.minMinutes).toBeNull()
    expect(durationValue("2", "")).toBe("120")
    expect(durationValue("", "45")).toBe("45")
    expect(durationFields("")).toEqual({ h: "", m: "" })
  })

  it("whole hours leave the minutes empty, so clearing the hours removes the limit", () => {
    expect(durationFields("60")).toEqual({ h: "1", m: "" })
    expect(durationFields("120")).toEqual({ h: "2", m: "" })
    const { m } = durationFields("60")
    expect(limitPatch("overtime", durationValue("", m)!)?.minMinutes).toBeNull()
  })

  it("a total of 0 from zeros is no limit, never 'more than 0 min'", () => {
    expect(durationValue("0", "0")).toBe("")
    expect(durationValue("0", "")).toBe("")
    expect(limitPatch("hours", durationValue("0", "0")!)?.minMinutes).toBeNull()
  })

  it("decimal hours are turned into minutes, with a dot or a comma", () => {
    expect(durationValue("1.5", "")).toBe("90")
    expect(durationValue("1,5", "")).toBe("90")
    expect(durationValue("0,25", "5")).toBe("20")
    expect(durationValue(" 2 ", "")).toBe("120")
    expect(durationFields(durationValue("1,5", "")!)).toEqual({ h: "1", m: "30" })
  })

  it("an unreadable field is never 'no limit' — nothing is saved", () => {
    for (const [h, m] of [
      ["abc", ""],
      ["-2", ""],
      ["1", "-5"],
      ["1.5.5", ""],
      ["1,2,3", ""],
      [",", ""],
    ])
      expect(durationValue(h, m)).toBeNull()
    expect(limitPatch("overtime", "1h")).toBeNull()
    expect(limitPatch("expense", "12€")).toBeNull()
    expect(limitPatch("request", "drei")).toBeNull()
    expect(limitCapped("expense", "lots")).toBe(false)
  })

  it("is capped at the kind's ceiling, in minutes", () => {
    expect(limitMax("overtime")).toBe(1440)
    expect(limitPatch("overtime", durationValue("30", "0")!)?.minMinutes).toBe(1440)
  })

  it("says when the typed value was capped, and the field reads the saved value", () => {
    expect(limitCapped("overtime", durationValue("30", "")!)).toBe(true)
    expect(limitCapped("overtime", durationValue("2", "")!)).toBe(false)
    expect(limitCapped("overtime", "")).toBe(false)
    const saved = limitPatchInput("overtime", limitPatch("overtime", durationValue("30", "")!)!)
    expect(durationFields(saved)).toEqual({ h: "24", m: "" })
    expect(limitPatchInput("expense", limitPatch("expense", "12.5")!)).toBe("12.50")
    expect(limitPatchInput("overtime", limitPatch("overtime", "")!)).toBe("")
  })

  it("missed clock-ins read as days in a row", () => {
    expect(limitText(t, "noShow", 3, "EUR")).toBe("3 days in a row")
  })

  it("other kinds keep their own unit", () => {
    expect(limitInput(rule("expense", { minAmountCents: 1250 }))).toBe("12.50")
    expect(limitPatch("expense", "12.5")?.minAmountCents).toBe(1250)
    expect(limitPatch("request", "3")?.minDays).toBe(3)
    expect(limitPatch("noShow", "")?.minDays).toBeNull()
  })

  it("money and whole numbers take a decimal comma too", () => {
    expect(limitPatch("expense", "12,50")?.minAmountCents).toBe(1250)
    expect(limitPatch("expense", ",5")?.minAmountCents).toBe(50)
    expect(limitPatch("request", "3,0")?.minDays).toBe(3)
    expect(limitPatch("noShow", "2,6")?.minDays).toBe(3)
    expect(readLimitNumber("12,50")).toBe(12.5)
    expect(readLimitNumber("  ")).toBe("")
    expect(readLimitNumber("1 000")).toBeNull()
  })
})

describe("a money limit — thousands separators, either way round", () => {
  afterEach(() => (mockLocale = "en"))
  const cents = (v: string) => limitPatch("expense", v)?.minAmountCents

  it("1.000 and 1,000 are a thousand, never 1", () => {
    expect(cents("1.000")).toBe(100_000)
    expect(cents("1,000")).toBe(100_000)
    expect(cents("12.000")).toBe(1_200_000)
    expect(cents("1.000.000")).toBe(100_000_000)
  })

  it("both separators: the last one is the decimal", () => {
    expect(cents("1.000,50")).toBe(100_050)
    expect(cents("1,000.50")).toBe(100_050)
    expect(readLimitNumber("1.000.000,5", true)).toBe(1_000_000.5)
  })

  it("a lone separator with one or two digits after it is the decimal", () => {
    expect(cents("12,50")).toBe(1250)
    expect(cents("12.5")).toBe(1250)
    expect(cents("12.")).toBe(1200)
    expect(cents("1000")).toBe(100_000)
  })

  it("what is still ambiguous, or badly grouped, is refused — never guessed", () => {
    for (const v of ["0,500", "1234.567", "1.00.000", "1.000,505", "1,000,50.5", "1.000.5", "12,5,0", ".", "1.2345"])
      expect(limitPatch("expense", v)).toBeNull()
  })

  it("a saved amount reads back in the reader's decimal style", () => {
    expect(limitInput(rule("expense", { minAmountCents: 1250 }))).toBe("12.50")
    expect(limitInput(rule("expense", { minAmountCents: 100_000 }))).toBe("1000")
    mockLocale = "de"
    expect(limitInput(rule("expense", { minAmountCents: 1250 }))).toBe("12,50")
    expect(limitInput(rule("expense", { minAmountCents: 100_000 }))).toBe("1000")
    // What is shown reads back as what was saved.
    expect(cents(limitInput(rule("expense", { minAmountCents: 1250 })))).toBe(1250)
  })
})

describe("a limit with no use for thousands — hours, minutes, days", () => {
  it("a separator followed by exactly three digits is refused, never read as 1", () => {
    expect(readLimitNumber("1.000")).toBeNull()
    expect(readLimitNumber("1,000")).toBeNull()
    expect(durationValue("1.000", "")).toBeNull()
    expect(limitPatch("request", "1.000")).toBeNull()
    expect(limitPatch("noShow", "2,000")).toBeNull()
  })
  it("decimals keep working", () => {
    expect(readLimitNumber("1,5")).toBe(1.5)
    expect(readLimitNumber("1.25")).toBe(1.25)
    expect(readLimitNumber(",5")).toBe(0.5)
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
  it("time outside the shift is judged on before AND after", () => {
    const outside = { ...item({ beforeMinutes: 40, afterMinutes: 80, requestedMinutes: 0 }), kind: "outside" }
    expect(limitOf(ruleLinkForItem(outside as ApprovalItem))).toBe("90")
  })
  it("a kind with a limit and no figure on the item offers nothing — it would be every item", () => {
    const hours = { ...item({ minutes: 480 }), kind: "hours" } as ApprovalItem
    expect(ruleLinkForItem(hours)).toBeNull()
    expect(ruleLinkForItem(item({}))).toBeNull()
  })
  it("a limit that rounds to nothing sends none — the rule is for every one", () => {
    expect(limitOf(ruleLinkForItem(item({ requestedMinutes: 20 })))).toBeNull()
    expect(ruleLinkForItem(item({ requestedMinutes: 20 }))).toContain("space=s1")
  })
})
