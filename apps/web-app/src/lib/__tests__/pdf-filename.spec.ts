import { dayKeyOf, fileNamePart, pdfFileName, periodPart } from "../pdf-filename"

describe("pdf file names", () => {
  it("client_kind_number_period, safe everywhere", () => {
    expect(pdfFileName([fileNamePart("BILLA AG"), fileNamePart("Invoice"), fileNamePart("INV-2026/0012"), periodPart("2026-09-01", "2026-09-30")]))
      .toBe("BILLA-AG_Invoice_INV-2026-0012_2026-09.pdf")
  })
  it("spells out umlauts and drops accents", () => {
    expect(fileNamePart("Müller & Söhne GmbH")).toBe("Mueller-and-Soehne-GmbH")
    expect(fileNamePart("Façade Élan")).toBe("Facade-Elan")
  })
  it("a part period, one day, an open end", () => {
    expect(periodPart("2026-09-01", "2026-09-15")).toBe("2026-09-01_2026-09-15")
    expect(periodPart("2026-02-01", "2026-02-28")).toBe("2026-02")
    expect(periodPart("2026-09-14T00:00:00.000Z", "2026-09-14")).toBe("2026-09-14")
    expect(periodPart(null, "2026-09-30")).toBe("2026-09-30")
  })
  it("skips empty parts, falls back when nothing is left", () => {
    expect(pdfFileName([fileNamePart("Karim Ahmad"), "", null, "2026-09"])).toBe("Karim-Ahmad_2026-09.pdf")
    expect(pdfFileName([fileNamePart("***")], "invoice")).toBe("invoice.pdf")
    expect(dayKeyOf("not a date")).toBeNull()
  })
  it("keeps a long client name short", () => {
    expect(fileNamePart("A".repeat(80)).length).toBe(40)
  })
})
