import { invoiceStamp } from "../invoice-status"
import { InvoiceStatus } from "@hbcfield/shared/client"

/**
 * What a customer is told about the state of their invoice.
 *
 * Every invoice used to carry its raw status beside the number, so a client
 * received a document that said "SENT" — news to nobody holding it — and a
 * draft was marked so quietly it read as part of the reference. A draft
 * mistaken for an invoice is the expensive direction of that mistake.
 *
 * The rule these tests hold: only states the reader must not misread earn a
 * mark, and anything that CHANGES earns silence. A PDF is a frozen copy that
 * outlives the state it was generated in — one stamped OVERDUE would still say
 * so a year after it was settled.
 */
describe("invoiceStamp", () => {
  it("marks a draft, because it is not an invoice yet", () => {
    expect(invoiceStamp("DRAFT")?.text).toBe("DRAFT")
  })

  it("marks a canceled invoice, because it is no longer owed", () => {
    expect(invoiceStamp("CANCELED")?.text).toBe("CANCELED")
  })

  it("accepts the other spelling of cancelled", () => {
    expect(invoiceStamp("CANCELLED")?.text).toBe("CANCELED")
  })

  it("marks a paid invoice, which is conventional and useful later", () => {
    expect(invoiceStamp("PAID")?.text).toBe("PAID")
  })

  it("says nothing about states that go stale in a frozen file", () => {
    for (const s of ["SENT", "OVERDUE", "REFUNDED"]) {
      expect(invoiceStamp(s)).toBeNull()
    }
  })

  it("colours a refusal red and a settlement green", () => {
    expect(invoiceStamp("DRAFT")!.color.r).toBeGreaterThan(invoiceStamp("PAID")!.color.r)
    expect(invoiceStamp("PAID")!.color.g).toBeGreaterThan(invoiceStamp("DRAFT")!.color.g)
  })

  it("is unbothered by casing and whitespace", () => {
    expect(invoiceStamp(" draft ")?.text).toBe("DRAFT")
  })

  it("says nothing for an empty or unknown status rather than inventing one", () => {
    for (const s of ["", "   ", "SOMETHING_NEW"]) {
      expect(invoiceStamp(s)).toBeNull()
    }
  })

  /*
    A guard rather than a rule: if a status is ever added to the enum, this
    fails and somebody has to decide whether a customer should see it — instead
    of it silently defaulting to invisible.
  */
  it("covers every status the enum currently has", () => {
    const known = Object.values(InvoiceStatus)
    expect(known.sort()).toEqual(
      ["CANCELED", "DRAFT", "OVERDUE", "PAID", "REFUNDED", "SENT"].sort(),
    )
  })
})
