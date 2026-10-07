import { documentIssuer, invoiceDocumentLabels, INVOICE_DOCUMENT_LABELS } from "../invoice-document-locale"
import en from "../../i18n/locales/en.json"
import de from "../../i18n/locales/de.json"
import es from "../../i18n/locales/es.json"
import fr from "../../i18n/locales/fr.json"
import itCat from "../../i18n/locales/it.json"

/** Who an invoice is FROM — one builder for the screen and the PDF (Settings › Companies). */
describe("documentIssuer", () => {
  const issuer = {
    legalEntityId: "le1", legalName: "HBC USA Inc.", label: "USA", addressLine1: "1 Main St", addressLine2: null,
    postalCode: "10001", city: "New York", state: "NY", country: "US", vatId: null, taxId: "12-3456789",
    registerNumber: null, email: null, phone: null, website: null, logoUrl: null, currency: "USD", invoicePrefix: "US",
    bank: { label: null, holder: "HBC USA Inc.", bankName: "Chase", iban: null, bic: null, accountNumber: "000123456", routingNumber: "021000021", currency: "USD" },
    frozenAt: "2026-10-07T10:00:00.000Z",
  }

  it("the invoice's issuer wins over the organization profile", () => {
    const d = documentIssuer(issuer, { name: "Acme", vatId: "ATU1" }, invoiceDocumentLabels("en"))
    expect(d.name).toBe("HBC USA Inc.")
    expect(d.addressLines).toEqual(["1 Main St", "10001 New York, NY", "US"])
    expect(d.idLines).toEqual(["Tax ID: 12-3456789"])
    expect(d.paymentLines).toEqual(["Account holder: HBC USA Inc.", "Chase", "Account 000123456", "Routing 021000021"])
  })

  it("in the client's language", () => {
    const d = documentIssuer(issuer, null, invoiceDocumentLabels("de"))
    expect(d.idLines).toEqual(["Steuernummer: 12-3456789"])
    expect(d.paymentLines[0]).toBe("Kontoinhaber: HBC USA Inc.")
  })

  it("an IBAN is grouped in fours for reading", () => {
    const d = documentIssuer({ ...issuer, bank: { ...issuer.bank, accountNumber: null, routingNumber: null, iban: "AT611904300234573201", bic: "BKAUATWW" } }, null, invoiceDocumentLabels("en"))
    expect(d.paymentLines).toContain("IBAN AT61 1904 3002 3457 3201")
    expect(d.paymentLines).toContain("BIC BKAUATWW")
  })

  it("with no issuer, the organization profile (no bank: the screen says where to add one)", () => {
    const d = documentIssuer(null, { name: "Acme", addressLine1: "Street 1", postalCode: "4663", city: "Laakirchen", country: "AT", vatId: "ATU1" }, invoiceDocumentLabels("en"))
    expect(d).toMatchObject({ name: "Acme", addressLines: ["Street 1", "4663 Laakirchen", "AT"], idLines: ["VAT / UID: ATU1"], paymentLines: [] })
  })

  it("every language carries every issuer label", () => {
    for (const L of Object.values(INVOICE_DOCUMENT_LABELS)) {
      for (const k of ["taxId", "register", "payTo", "holder", "account", "routing"] as const) expect(L[k]).toBeTruthy()
    }
  })

  it("every language carries the Companies screen", () => {
    const keys = Object.keys(en.companies).sort()
    for (const cat of [de, es, fr, itCat]) {
      expect(Object.keys(cat.companies).sort()).toEqual(keys)
      expect(cat.settings.nav.companies).toBeTruthy()
    }
  })
})
