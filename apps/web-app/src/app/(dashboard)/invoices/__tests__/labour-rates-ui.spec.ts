import fs from "fs"
import path from "path"

/*
  Two rates on screen — and only where both are true.

  ⚠️ A one-rate company must never be shown a margin row of dashes it has to
  learn to ignore, and whoever raises an invoice is not automatically entitled
  to know what the labour cost. Those are two different conditions and both are
  necessary.
*/
const ROOT = path.join(__dirname, "..")
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8")
const code = (p: string) =>
  read(p).replace(/(^|\s)\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

const DRAFT = "new/page.tsx"
const MEMBER = "../members/_components/edit-member-dialog.tsx"

describe("the invoice draft", () => {
  it("shows margin only when the data says two rates AND the person may see cost", () => {
    const src = code(DRAFT)
    expect(src).toMatch(/showMargin =[\s\S]{0,160}canViewLabourCost/)
    expect(src).toMatch(/showMargin =[\s\S]{0,160}twoRates/)
  })

  it("never re-derives cost in the browser", () => {
    /*
      Cost only comes from entries the SERVER resolved. A browser computing a
      margin from rates it happened to hold would be a second answer to the
      question the boundary exists to control — and it would keep working after
      the strip started removing them.
    */
    const src = code(DRAFT)
    expect(src).toMatch(/costRateCents != null/)
    expect(src).not.toMatch(/costRate\s*=\s*Number\(/)
  })

  it("bills each line at that member's own rate, not one rate for the job", () => {
    // One job rate is wrong the moment two people with different rates work the
    // same site — the normal case for anyone billing labour at all.
    const src = code(DRAFT)
    expect(src).toMatch(/entryRate = \(e: WorkEntry\)/)
    expect(src).toMatch(/unitPrice: lineRate/)
  })

  it("sends the rates with the line, so an issued invoice stops moving", () => {
    const src = code(DRAFT)
    expect(src).toMatch(/billRateCents: e\.billRateCents/)
    expect(src).toMatch(/costRateCents: e\.costRateCents/)
    expect(src).toContain("billedHours: e.hours")
  })
})

describe("the member editor carries COST, and only cost", () => {
  const src = () => code(MEMBER)

  it("has no client-facing rate on it", () => {
    /*
      ⚠️ Reported, and right: a bill rate on a member reads backwards. What
      somebody COSTS is a fact about the person and follows them everywhere;
      what a CLIENT pays for their hour is a fact about that client, and the
      same engineer is routinely worth €45 at one customer and €60 at another.
      A single field on a person cannot say that.
    */
    const s = src()
    expect(s).not.toContain("members.memberEditor.billRateLabel")
    expect(s).not.toMatch(/setBillRate/)
  })

  it("gates the cost rate, and says so when it is hidden", () => {
    // An absence explains nothing — somebody expecting a cost field and
    // finding none concludes the product has it the wrong way round.
    const s = src()
    expect(s).toMatch(/canViewLabourCost \?[\s\S]{0,500}costRateLabel/)
    expect(s).toContain("members.memberEditor.costRateHidden")
  })

  it("sends null for a blank field, never zero", () => {
    // Null means "inherit"; 0 means this person costs nothing.
    expect(src()).toMatch(/costRate\.trim\(\) === ""[\s\S]{0,30}\? null/)
  })
})

describe("the client-facing rate lives on the assignment", () => {
  const EDITOR = "../locations/[id]/_components/member-rate-editor.tsx"
  const src = () => code(EDITOR)

  it("exists, and is per workspace", () => {
    expect(src()).toContain("spaceMembersApi.updateRate")
  })

  it("shows what it would inherit rather than an empty box", () => {
    /*
      An empty box with no number beside it reads as "this person bills nothing
      here", which is the one reading that must not happen on a screen about
      money.
    */
    expect(src()).toContain("inheritedBillRateCents")
    expect(src()).toContain("scheduling.members.rateInherits")
  })

  it("offers to copy the inherited figure so it can be edited", () => {
    // The common edit is "the usual rate, but different here" — copying beats
    // making somebody find the number on another screen and retype it.
    const s = src()
    expect(s).toContain("scheduling.members.copyRate")
    expect(s).toMatch(/setValue\(String\(inherited \/ 100\)\)/)
  })

  it("sends null for blank, never zero", () => {
    expect(src()).toMatch(/value\.trim\(\) === ""[\s\S]{0,20}\? null/)
  })

  it("resolves the inherited rate on the SERVER", () => {
    // The order of the four levels is written down once, in `resolveRate`. A
    // second copy in a browser is a second answer to "why is this €40".
    const svc = fs.readFileSync(
      path.join(ROOT, "../../../../../api/task-service/src/modules/space-roles/space-roles.service.ts"),
      "utf8",
    )
    expect(svc).toContain("inheritedBillRateCents")
    expect(svc).toContain("resolveRate(")
  })
})

describe("every new string is translated", () => {
  const LOCALES = path.join(ROOT, "../../../i18n/locales")
  it.each(["en", "de", "es", "fr", "it"])("%s", (lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
    const missingInvoice = ["marginTitle", "billed", "labourCost", "margin", "marginHint"]
      .filter((k) => typeof d.invoices?.create?.[k] !== "string")
    const missingMember = ["costRateLabel", "ratePlaceholder", "costRateHint", "costRateHidden"]
      .filter((k) => typeof d.members?.memberEditor?.[k] !== "string")
    const missingRate = ["rateLabel", "rateInherits", "rateNone", "copyRate", "rateSaved", "rateBlankHint", "rateSetHint"]
      .filter((k) => typeof d.scheduling?.members?.[k] !== "string")
    expect({ lang, missingRate }).toEqual({ lang, missingRate: [] })
    expect({ lang, missingInvoice, missingMember })
      .toEqual({ lang, missingInvoice: [], missingMember: [] })
  })
})
