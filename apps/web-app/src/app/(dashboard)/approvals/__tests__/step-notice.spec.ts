import fs from "fs"
import path from "path"
import type { ApprovalItem } from "@hbcfield/shared/client"
import { initialDecisionMinutes, matchesFilter, stepNoticeKey } from "../_lib/step-notice"

/* A second approver's form starts on what was already agreed; the inbox says when an item waits for the reader. */

type Step = NonNullable<ApprovalItem["step"]>
const step = (s: Partial<Step> = {}): Step => ({
  firstById: "u1",
  firstByName: "Anna",
  roleName: "HR",
  mine: false,
  ...s,
})
const item = (data: ApprovalItem["data"], s?: Partial<Step>) =>
  ({ kind: "overtime", data, step: s ? step(s) : undefined }) as Pick<ApprovalItem, "kind" | "data" | "step">

describe("where the duration field starts", () => {
  it("on the time an earlier approver agreed, never the asked-for time", () => {
    expect(initialDecisionMinutes(item({ requestedMinutes: 120 }, { agreedMinutes: 90 }))).toBe(90)
  })
  it("an agreed 0 is kept (not a default)", () => {
    expect(initialDecisionMinutes(item({ requestedMinutes: 120 }, { agreedMinutes: 0 }))).toBe(0)
  })
  it("on what was asked when nobody agreed yet", () => {
    expect(initialDecisionMinutes(item({ requestedMinutes: 45 }, { agreedMinutes: null }))).toBe(45)
  })
  it("on 30 minutes when nothing is known", () => {
    expect(initialDecisionMinutes(item({}))).toBe(30)
  })
})

describe("the step sentence", () => {
  it("the reader went first", () => expect(stepNoticeKey(step({ mine: true }))).toBe("approvals.step.mine"))
  it("the reader finishes it", () =>
    expect(stepNoticeKey(step({ waitsForYou: true, youFinish: true }))).toBe("approvals.step.youFinish"))
  it("the reader is one of those still needed", () =>
    expect(stepNoticeKey(step({ waitsForYou: true }))).toBe("approvals.step.waitingYou"))
  it("somebody else's turn", () => expect(stepNoticeKey(step())).toBe("approvals.step.waiting"))
})

describe("the rail's filter", () => {
  it("'yours' keeps only what waits for the reader", () => {
    expect(matchesFilter(item({}, { waitsForYou: true }), "yours")).toBe(true)
    expect(matchesFilter(item({}, {}), "yours")).toBe(false)
    expect(matchesFilter(item({}), "yours")).toBe(false)
  })
  it("a kind and everything", () => {
    expect(matchesFilter(item({}), "overtime")).toBe(true)
    expect(matchesFilter(item({}), "hours")).toBe(false)
    expect(matchesFilter(item({}), "all")).toBe(true)
  })
})

describe("the new words exist in every language", () => {
  const keys = ["yours", "datesPassed", "step.youFinish", "step.waitingYou", "step.agreed"]
  for (const lang of ["en", "de", "es", "fr", "it"]) {
    it(lang, () => {
      const file = path.join(__dirname, "../../../../i18n/locales", `${lang}.json`)
      const approvals = JSON.parse(fs.readFileSync(file, "utf8")).approvals
      for (const k of keys) {
        const v = k.split(".").reduce((o, p) => o?.[p], approvals)
        expect(typeof v).toBe("string")
      }
    })
  }
})
