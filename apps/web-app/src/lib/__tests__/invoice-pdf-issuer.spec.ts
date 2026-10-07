/**
 * @jest-environment node
 */
jest.mock("jspdf", () => { const a = jest.requireActual("jspdf/dist/jspdf.node.min.js"); return { __esModule: true, default: a.jsPDF, jsPDF: a.jsPDF } })
import { buildDoc } from "../invoice-pdf"

/** The PDF itself names the invoice's company — From, tax ID and Bank details — not the organization. */
describe("invoice PDF issuer", () => {
  it("draws the issuing company and its bank, in the client's language", async () => {
    ;(globalThis as { Image?: unknown }).Image = class { set src(_v: string) { setTimeout(() => (this as unknown as { onerror?: () => void }).onerror?.(), 0) } } as never
    const doc = await buildDoc(
      {
        invoiceNumber: "US-2026-0001", status: "ISSUED", clientName: "BILLA demo", currency: "USD",
        subtotal: 100, taxAmount: 0, discount: 0, total: 100, items: [{ description: "Work", quantity: 1, unitPrice: 100, amount: 100 }],
        locale: "de",
        issuer: {
          legalEntityId: "le1", legalName: "HBC USA Inc.", label: "USA", addressLine1: "5000 Legacy Dr", addressLine2: null,
          postalCode: "75034", city: "Frisco", state: "TX", country: "US", vatId: null, taxId: "88-1234567", registerNumber: null,
          email: null, phone: null, website: null, logoUrl: null, currency: "USD", invoicePrefix: "US",
          bank: { label: null, holder: "HBC USA Inc.", bankName: "Chase", iban: null, bic: null, accountNumber: "000123456789", routingNumber: "021000021", currency: "USD" },
          frozenAt: "2026-10-07T20:32:10.673Z",
        },
      },
      { name: "Acme Corporation", vatId: "ATU999" },
    )
    const raw = doc.output()
    expect(raw).toContain("HBC USA Inc.")
    expect(raw).toContain("5000 Legacy Dr")
    expect(raw).toContain("Steuernummer: 88-1234567")
    expect(raw).toContain("BANKVERBINDUNG")
    expect(raw).toContain("Routing 021000021")
    expect(raw).not.toContain("Acme Corporation")
    expect(raw).not.toContain("ATU999")
  })
})
