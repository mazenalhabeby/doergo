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
