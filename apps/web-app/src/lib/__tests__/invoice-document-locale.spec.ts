import fs from "fs"
import path from "path"
import { SUPPORTED_LOCALES } from "@hbcfield/shared/client"

/*
  The client's copy of an invoice is written in the CLIENT's language.

  What is held here: every language carries every label with the same
  placeholders; dates and amounts are formatted for that language and drawable
  by the PDF font; the terms sentence and the watermark follow; the office's
  one-off choice wins over the client's; and — by drawing a real invoice through
  a recording jsPDF — that no English label is left on a German document while
  the descriptions and notes go through exactly as written.
*/

// A jsPDF that records what is written, so the document can be read back.
const drawn: string[] = []
const tables: Array<{ head: string[][]; body: string[][] }> = []
jest.mock("jspdf", () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }
    GState = class { constructor(public o: unknown) {} }
    lastAutoTable = { finalY: 120 }
    private pages = 1
    text(t: string | string[]) { drawn.push(...(Array.isArray(t) ? t : [t])) }
    splitTextToSize(t: string) { return [t] }
    getNumberOfPages() { return this.pages }
    setPage() {}
    addPage() { this.pages++ }
    save() {}
    output() { return "blob:fake" }
    setTextColor() {} ; setFont() {} ; setFontSize() {} ; setDrawColor() {} ; setLineWidth() {}
    line() {} ; addImage() {} ; saveGraphicsState() {} ; restoreGraphicsState() {} ; setGState() {}
  }
  return { __esModule: true, default: FakeDoc }
})
jest.mock("jspdf-autotable", () => ({
  __esModule: true,
  default: (doc: { addPage: () => void }, opts: { head: string[][]; body: string[][] }) => {
    tables.push({ head: opts.head, body: opts.body })
    doc.addPage() // a long invoice: the footer must count two pages
  },
}))

import {
  INVOICE_DOCUMENT_LABELS, documentLocaleOf, formatDocumentDate, formatDocumentMoney, formatDocumentQuantity,
  pdfLocaleFor, pdfText, termsSentence,
} from "../invoice-document-locale"
import { exportInvoicePdf, type InvoicePdfData } from "../invoice-pdf"

const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
const flatten = (o: object): Record<string, string> =>
  Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Object.entries(flatten(v)).map(([kk, vv]) => [`${k}.${kk}`, vv]))))

describe("invoice document labels — five languages", () => {
  const en = flatten(INVOICE_DOCUMENT_LABELS.en)

  it("every language has every label, none empty, with the same placeholders", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const labels = flatten(INVOICE_DOCUMENT_LABELS[locale])
      expect(Object.keys(labels).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(labels)) {
        expect({ locale, k, empty: v.trim() === "" }).toEqual({ locale, k, empty: false })
        expect({ locale, k, p: placeholders(v) }).toEqual({ locale, k, p: placeholders(en[k]) })
      }
    }
  })

  it("the non-English documents are actually translated", () => {
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
      const labels = flatten(INVOICE_DOCUMENT_LABELS[locale])
      const same = Object.keys(en).filter((k) => labels[k] === en[k])
      // A handful of words are genuinely the same ("Total", "Description", "Subtotal").
      expect({ locale, same: same.length <= 4 }).toEqual({ locale, same: true })
    }
  })

  it("never says paid, and German addresses the reader formally", () => {
    const pay = /\b(un)?paid\b|\bpay\b|bezahl|vergütet|pagad|remunerad|payé|rémunér|pagat|retribuit/i
    for (const locale of SUPPORTED_LOCALES) {
      for (const v of Object.values(flatten(INVOICE_DOCUMENT_LABELS[locale]))) expect(v).not.toMatch(pay)
    }
    expect(Object.values(flatten(INVOICE_DOCUMENT_LABELS.de)).join(" ")).not.toMatch(/\b(du|dein|deine|dich|dir)\b/i)
    expect(INVOICE_DOCUMENT_LABELS.de.termsDue).toContain("Sie")
  })

  it("uses only characters the PDF font can draw (Latin-1)", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const v of Object.values(flatten(INVOICE_DOCUMENT_LABELS[locale]))) {
        expect({ locale, v, latin1: /^[\x20-\x7E\xA0-\xFF]*$/.test(v) }).toEqual({ locale, v, latin1: true })
      }
    }
  })
})

describe("dates and amounts in the document's language", () => {
  it("formats money per language, drawable by the font", () => {
    expect(formatDocumentMoney(1234.5, "EUR", "en")).toBe("€1,234.50")
    expect(formatDocumentMoney(1234.5, "EUR", "de")).toBe("1.234,50 €")
    // Italian and Spanish group only from five digits — their own convention, not a bug.
    expect(formatDocumentMoney(12345.5, "EUR", "it")).toBe("12.345,50 €")
    expect(formatDocumentMoney(12345.5, "EUR", "es")).toBe("12.345,50 €")
    expect(formatDocumentMoney(1234.5, "EUR", "fr")).toBe("1 234,50 €")
    for (const l of SUPPORTED_LOCALES) expect(formatDocumentMoney(98765.43, "EUR", l)).toMatch(/^[\x20-\x7E\xA0-\xFF€]*$/)
    expect(formatDocumentMoney(1234.5, "EUR", "fr")).not.toMatch(/[  ]/)
  })

  it("formats dates per language", () => {
    const d = "2026-09-05T10:00:00Z"
    // ICU versions differ on "Sep" / "Sept"; the shape is what is pinned.
    expect(formatDocumentDate(d, "en")).toMatch(/^05 Sept? 2026$/)
    expect(formatDocumentDate(d, "de")).toMatch(/^05\. Sep/)
    expect(formatDocumentDate(d, "fr")).toMatch(/^05 sept\. 2026$/)
    expect(formatDocumentDate(d, "es")).toMatch(/^05 sept?\.? 2026$/)
    expect(formatDocumentDate(null, "de")).toBe("—")
    expect(formatDocumentQuantity(1.5, "de")).toBe("1,5")
    expect(formatDocumentQuantity(1.5, "en")).toBe("1.5")
  })

  it("strips the spaces the font cannot draw, and nothing else", () => {
    expect(pdfText("1 234,50 €")).toBe("1 234,50 €")
    expect(pdfText("Rechnung an")).toBe("Rechnung an")
  })

  it("asks to settle a due invoice by its date or on receipt — and says nothing once it is settled", () => {
    const base = { total: 100, currency: "EUR" }
    expect(termsSentence("de", { ...base, status: "ISSUED", dueDate: "2026-09-30T00:00:00Z" })).toMatch(/^Bitte begleichen Sie 100,00 € bis zum 30\. Sep/)
    expect(termsSentence("fr", { ...base, status: "SENT" })).toBe("Merci de régler 100,00 € à réception.")
    for (const status of ["PAID", "CANCELED", "REFUNDED"]) expect(termsSentence("en", { ...base, status })).toBeNull()
  })
})

describe("which language a download is written in", () => {
  it("the client's by default, the office's choice when it makes one", () => {
    expect(pdfLocaleFor({ documentLocale: "de" }, null)).toBe("de")
    expect(pdfLocaleFor({ documentLocale: "de" }, "it")).toBe("it")
    // A server that has not sent one yet, or sent something unknown, reads English.
    expect(pdfLocaleFor({}, null)).toBe("en")
    expect(documentLocaleOf("pt-BR")).toBe("en")
  })

  it("the invoice page sends that language to both the download and the print", () => {
    const page = fs.readFileSync(path.join(__dirname, "../../app/(dashboard)/invoices/[id]/page.tsx"), "utf8")
    expect(page.match(/toPdfData\(inv, pdfLocaleFor\(inv, pdfLocaleOverride\)\)/g)?.length).toBe(2)
    expect(page).toContain("invoices.pdfLanguage.client")
  })
})

describe("the drawn invoice", () => {
  const invoice = (over: Partial<InvoicePdfData> = {}): InvoicePdfData => ({
    invoiceNumber: "INV-2026-0042",
    status: "DRAFT",
    clientName: "Müller Haustechnik GmbH",
    clientEmail: "office@mueller.at",
    currency: "EUR",
    subtotal: 1000,
    taxRate: 0.2,
    taxAmount: 200,
    discount: 0,
    total: 1200,
    issueDate: "2026-09-01T09:00:00Z",
    dueDate: "2026-09-15T09:00:00Z",
    servicePeriodFrom: "2026-08-01T00:00:00Z",
    servicePeriodTo: "2026-08-31T23:59:59Z",
    notes: "Thank you for the quick turnaround",
    items: [{ description: "Boiler service, Flat 3", quantity: 2, unitPrice: 500, amount: 1000 }],
    ...over,
  })

  beforeEach(() => { drawn.length = 0; tables.length = 0 })

  it("writes a German invoice in German, and leaves what somebody wrote as written", async () => {
    await exportInvoicePdf(invoice({ locale: "de" }), { name: "HBC GmbH", vatId: "ATU12345678" })
    const text = drawn.join("\n")
    for (const w of ["RECHNUNG", "Rechnungsnr. INV-2026-0042", "RECHNUNG AN", "Rechnungsdatum", "Fälligkeitsdatum", "Leistungszeitraum", "Zwischensumme", "USt. (20%)", "Gesamt", "ANMERKUNGEN", "Seite 1 von 2", "Seite 2 von 2", "ENTWURF", "USt-IdNr.: ATU12345678", "1.200,00 €"]) {
      expect(text).toContain(w)
    }
    expect(tables[0].head).toEqual([["Beschreibung", "Menge", "Einzelpreis", "Betrag"]])
    // Somebody's words: never translated.
    expect(tables[0].body[0][0]).toBe("Boiler service, Flat 3")
    expect(text).toContain("Thank you for the quick turnaround")
    expect(text).toContain("Müller Haustechnik GmbH")
    // And no English label left behind.
    for (const w of ["INVOICE", "BILL TO", "Issue date", "Due date", "Subtotal", "Tax (", "Total", "NOTES", "DRAFT", "Page "]) {
      expect(text).not.toContain(w)
    }
  })

  it("stamps a settled invoice without the word paid, in the reader's language", async () => {
    await exportInvoicePdf(invoice({ locale: "fr", status: "PAID" }), {})
    const text = drawn.join("\n")
    expect(text).toContain("RÉGLÉE")
    expect(text).not.toMatch(/PAID|PAYÉE/)
    // A settled invoice asks for nothing.
    expect(text).not.toContain("Merci de régler")
  })

  it("keeps English for a caller that names no language", async () => {
    await exportInvoicePdf(invoice({ status: "ISSUED", dueDate: null }), {})
    const text = drawn.join("\n")
    expect(text).toContain("INVOICE")
    expect(text).toContain("On receipt")
    expect(text).toContain("Please settle €1,200.00 on receipt.")
    expect(text).toContain("Page 2 of 2")
  })
})
