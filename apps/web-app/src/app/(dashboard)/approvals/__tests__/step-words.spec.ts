import fs from "fs"
import path from "path"
import { agreedLine, initialDecisionMinutes, stepNoticeKind, type ApprovalItem } from "@hbcfield/shared/client"

/* The step's words come from shared rules (`approvals.step.<kind>`): every key they can name exists in all five. */

type Step = NonNullable<ApprovalItem["step"]>
const step = (s: Partial<Step> = {}): Step => ({
  firstById: "u1",
  firstByName: "Anna",
  roleName: "HR",
  mine: false,
  ...s,
})

describe("the time field and the line above it", () => {
  it("starts on the agreed time; an agreed 0 is none", () => {
    expect(initialDecisionMinutes({ data: { requestedMinutes: 120 }, step: step({ agreedMinutes: 90 }) })).toBe(90)
    expect(initialDecisionMinutes({ data: { requestedMinutes: 120 }, step: step({ agreedMinutes: 0 }) })).toBe(120)
  })
  it("names the one approver, not one of several; never the reader's own", () => {
    expect(agreedLine(step({ agreedMinutes: 60 }))?.who).toBe("Anna")
    expect(agreedLine(step({ agreedMinutes: 60, approverCount: 2 }))?.who).toBeNull()
    expect(agreedLine(step({ agreedMinutes: 60, youApproved: true }))).toBeNull()
  })
})

describe("the words exist in every language", () => {
  const kinds = [
    stepNoticeKind(step({ youApproved: true })),
    stepNoticeKind(step({ waitsForYou: true, youFinish: true })),
    stepNoticeKind(step({ waitsForYou: true })),
    stepNoticeKind(step()),
  ]
  const keys = [
    "waitsForYou",
    "datesPassed",
    "step.badge",
    ...kinds.map((k) => `step.${k}`),
    ...["agreedBy", "agreedByCounts", "agreedSoFar", "agreedSoFarCounts"].map((k) => `step.${k}`),
  ]
  it("every sentence kind is a different one", () => expect(new Set(kinds).size).toBe(4))
  for (const lang of ["en", "de", "es", "fr", "it"]) {
    it(lang, () => {
      const file = path.join(__dirname, "../../../../i18n/locales", `${lang}.json`)
      const approvals = JSON.parse(fs.readFileSync(file, "utf8")).approvals
      for (const k of keys) expect([k, typeof k.split(".").reduce((o, p) => o?.[p], approvals)]).toEqual([k, "string"])
    })
  }
})
