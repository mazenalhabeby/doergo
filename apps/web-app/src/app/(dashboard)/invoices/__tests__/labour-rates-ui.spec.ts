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

describe("the member editor", () => {
  const src = () => code(MEMBER)

  it("offers the bill rate to anyone who may edit a member", () => {
    // What the work is worth is not a secret; learning what the company PAYS
    // for that hour should not be a side effect of fixing a job title.
    expect(src()).toContain("members.memberEditor.billRateLabel")
  })

  it("gates the cost rate on the permission", () => {
    expect(src()).toMatch(/canViewLabourCost && \([\s\S]{0,400}costRateLabel/)
  })

  it("sends null for a blank field, never zero", () => {
    /*
      ⚠️ Null means "inherit"; 0 means this person bills nothing, and the ladder
      cannot tell them apart after the fact. A form that sends 0 for an empty
      box has quietly set a rate.
    */
    const s = src()
    expect(s).toMatch(/billRate\.trim\(\) === ""[\s\S]{0,30}\? null/)
    expect(s).toMatch(/costRate\.trim\(\) === ""[\s\S]{0,30}\? null/)
  })

  it("shows euros and stores cents", () => {
    const s = src()
    expect(s).toMatch(/billRateCents \/ 100/)
    expect(s).toMatch(/Number\(billRate\) \* 100/)
  })
})

describe("every new string is translated", () => {
  const LOCALES = path.join(ROOT, "../../../i18n/locales")
  it.each(["en", "de", "es", "fr", "it"])("%s", (lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
    const missingInvoice = ["marginTitle", "billed", "labourCost", "margin", "marginHint"]
      .filter((k) => typeof d.invoices?.create?.[k] !== "string")
    const missingMember = ["billRateLabel", "costRateLabel", "ratePlaceholder", "billRateHint", "costRateHint"]
      .filter((k) => typeof d.members?.memberEditor?.[k] !== "string")
    expect({ lang, missingInvoice, missingMember })
      .toEqual({ lang, missingInvoice: [], missingMember: [] })
  })
})
