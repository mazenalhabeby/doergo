import fs from "fs"
import path from "path"

import { code } from "./_screen"

/*
  THE INVOICE, ONCE IT EXISTS.

  ⚠️ This page drew its own version of the document — a THIRD one, and the
  poorest: no payment block, no company address, its own table markup, and a
  letterhead that read "NEW INVOICE" because it uppercased the page title. That
  is what a customer got when somebody pressed Print.

  ⚠️ And the two questions a person opens an invoice to answer — how much, and
  where does it stand — were the two hardest things on the page to find. The
  total was the last row of a table at the bottom of the sheet; the state was a
  10px chip. Meanwhile Edit, Cancel and Delete floated under the sheet in a bare
  row with no container, two of them destructive.
*/

const PAGE = "[id]/page.tsx"
const LOCALES = path.join(__dirname, "../../../../i18n/locales")

describe("the issued invoice", () => {
  it("renders the SHARED document, not a third copy of one", () => {
    const src = code(PAGE)
    expect(src).toContain("InvoiceDocument")
    // Its own table is gone, not merely unused.
    expect(src).not.toMatch(/grid-cols-\[1fr_70px_100px_100px\]/)
    expect(src).not.toContain("invoices.columns.description")
  })

  it("never calls the page title the name of the document", () => {
    /*
      ⚠️ `t("invoices.create.title").toUpperCase()` printed "NEW INVOICE" on an
      issued document. The word a client reads is its own key, precisely so a
      screen's own name can never leak onto the page.
    */
    const src = code(PAGE)
    expect(src).not.toMatch(/invoices\.create\.title["']\)\.toUpperCase/)
    expect(code("_components/invoice-document.tsx")).toContain("invoices.create.documentWord")
  })

  it("offers only the client's copy", () => {
    // The working view is a BUILDING aid. An issued invoice has one true form,
    // and a second rendering invites the question of which one the client got.
    expect(code(PAGE)).toMatch(/frames="client"/)
  })

  it("answers how much and where it stands, above the document", () => {
    const src = code(PAGE)
    expect(src).toContain("invoices.create.amountDue")
    expect(src).toContain("daysOverdue")
    // Late, due, paid and cancelled must not all read the same.
    for (const key of ["invoices.detail.paidOn", "invoices.detail.overdueBy", "invoices.detail.dueIn"]) {
      expect(src).toContain(key)
    }
  })

  it("states the payment term even when there is none", () => {
    /*
      An invoice with no due date is payable ON RECEIPT — a real and common
      arrangement. It used to render an em-dash, and a customer cannot act on a
      dash. The document says it too, not only this summary.
    */
    expect(code(PAGE)).toContain("invoices.create.onReceipt")
    expect(code("_components/invoice-document.tsx")).toContain("invoices.create.onReceipt")
  })

  it("keeps the destructive actions out of the open", () => {
    const src = code(PAGE)
    expect(src).toContain("DropdownMenu")
    // Delete still confirms, and the dialog still names the amount.
    expect(src).toContain("setConfirmDelete(true)")
    expect(src).toContain("invoices.delete.desc")
  })

  it("sits in the same bar and the same column as the other two screens", () => {
    const src = code(PAGE)
    expect(src).toContain("InvoiceTopBar")
    expect(src).toMatch(/cn\(PAGE_WIDTH/)
    // The old narrow wrapper that put the back arrow 200px off the navbar.
    expect(src).not.toMatch(/max-w-3xl mx-auto/)
  })

  it.each(["en", "de", "es", "fr", "it"])("says the payment term in %s", (lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
    expect(typeof d.invoices?.create?.onReceipt).toBe("string")
    expect(d.invoices.create.onReceipt.length).toBeGreaterThan(1)
    // Plurals: "1 day overdue" and "3 days overdue" are different sentences.
    expect(typeof d.invoices?.detail?.overdueBy_one).toBe("string")
    expect(typeof d.invoices?.detail?.overdueBy_other).toBe("string")
  })
})

describe("the way out", () => {
  /*
    ⚠️ THE ARROW GOES TO THE LIST, on all three screens.

    `router.back()` is not a destination. Opened from a link, a notification or
    a fresh tab there is nothing to go back TO and the arrow does nothing at
    all — a control that is sometimes inert. Arrived at from the invoice you
    just saved, it walks you back into the draft you already committed.

    All three screens are ABOUT one invoice, and the place above them is the
    same place.
  */
  const SCREENS = ["new/page.tsx", "[id]/page.tsx", "[id]/edit/page.tsx"]

  it.each(SCREENS)("sends %s back to the list", (screen) => {
    const src = code(screen)
    const backs = src.match(/onBack=\{[^}]*\}/g) ?? []
    expect(backs.length).toBeGreaterThan(0)
    for (const back of backs) {
      expect(back).toContain('router.push("/invoices")')
    }
  })

  it.each(SCREENS)("never navigates by history on %s", (screen) => {
    expect(code(screen)).not.toContain("router.back()")
  })

  it("still returns Cancel to the invoice being edited", () => {
    /*
      Deliberately NOT the list. Cancel means "do not save these changes", and
      the thing a person wants to see next is the invoice as it stands —
      unchanged. That is a different question from "I am finished here", which
      is what the arrow answers.
    */
    const src = code("[id]/edit/page.tsx")
    expect(src).toMatch(/common\.cancel[\s\S]{0,200}|[\s\S]{0,200}common\.cancel/)
    expect(src).toMatch(/onClick=\{\(\) => router\.push\(`\/invoices\/\$\{id\}`\)\}/)
  })
})

describe("the invoice list", () => {
  const LIST = "page.tsx"

  it("sits in the app's column", () => {
    // It was `max-w-6xl` — three hundred pixels narrower than the navigation
    // above it, so the title floated in from the left edge.
    const src = code(LIST)
    expect(src).toMatch(/cn\(PAGE_WIDTH/)
    expect(src).not.toMatch(/max-w-6xl mx-auto/)
  })

  it("makes the ageing legend a way into the list, not a label", () => {
    /*
      ⚠️ A person read "90+ days €13,450" and then had to find those invoices
      by hand in a list of fifty. Reading a figure and acting on it were two
      different jobs on one screen.
    */
    const src = code(LIST)
    expect(src).toContain("setBandFilter")
    expect(src).toMatch(/bandFilter &&[\s\S]{0,200}bandFor\(daysOverdue/)
  })

  it("never files a settled invoice under an ageing band", () => {
    // A band describes money that is OWED. The filter has to say so.
    expect(code(LIST)).toMatch(/bandFilter && \(!isOutstanding\(inv\)/)
  })

  it("groups the list into the four piles", () => {
    const src = code(LIST)
    expect(src).toContain("groupByBucket")
    for (const k of ["invoices.buckets.overdue", "invoices.buckets.open", "invoices.buckets.draft", "invoices.buckets.settled"]) {
      expect(src).toContain(k)
    }
  })

  it("surfaces the pile the ISSUED state created", () => {
    /*
      Finished documents the client has not been given. Nothing else on the
      page would show them — they are not late, and they are not drafts.
    */
    const src = code(LIST)
    expect(src).toMatch(/status === "ISSUED"/)
    expect(src).toContain("invoices.awaitingSend")
  })

  it("says how much of the list is being hidden", () => {
    // A filtered list and a nearly-empty business look identical.
    const src = code(LIST)
    expect(src).toContain("invoices.showing")
    expect(src).toContain("invoices.noneMatch")
  })

  it("lets a keyboard open a row", () => {
    // The whole row is the target, so it has to behave like one.
    const src = code(LIST)
    expect(src).toMatch(/role="button"/)
    expect(src).toMatch(/tabIndex=\{0\}/)
    expect(src).toMatch(/e\.key === "Enter" \|\| e\.key === " "/)
  })

  it.each(["en", "de", "es", "fr", "it"])("names the four piles in %s", (lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
    for (const k of ["overdue", "open", "draft", "settled"]) {
      expect(typeof d.invoices?.buckets?.[k]).toBe("string")
    }
    expect(typeof d.invoices?.awaitingSend).toBe("string")
  })
})
