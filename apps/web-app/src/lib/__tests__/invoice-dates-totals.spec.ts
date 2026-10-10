import { invoiceTotals, labourTotalCents, buildLabourLines } from "@hbcfield/shared/client"

import { formatDocumentDate, invoiceDayKey } from "@/lib/invoice-document-locale"
import { fmtDate } from "@/app/(dashboard)/invoices/_components/invoice-document"
import { daysOverdue } from "@/app/(dashboard)/invoices/_lib/aging"

/*
  Invoice dates are calendar DAYS. The server stores a day as its start in UTC
  and the service-period END at 23:59:59.999Z; a saved invoice used to read
  "01 Sept – 01 Oct" east of UTC (and "31 Aug" for the start west of it).
  Read with timeZone UTC, both old and new rows read the day they were raised for.
*/
describe("invoice dates are days, whatever the reader's zone", () => {
  const original = process.env.TZ
  afterAll(() => { process.env.TZ = original })

  for (const tz of ["Europe/Vienna", "America/Chicago", "UTC"]) {
    it(`reads the stored days as written — ${tz}`, () => {
      process.env.TZ = tz
      const from = "2026-09-01T00:00:00.000Z"
      const to = "2026-09-30T23:59:59.999Z"
      expect(fmtDate(from)).toBe("01 Sept 2026")
      expect(fmtDate(to)).toBe("30 Sept 2026")
      // A form's own value (draft screen) reads the same day too.
      expect(fmtDate("2026-10-10")).toBe("10 Oct 2026")
      // The PDF, in German and English.
      expect(formatDocumentDate(to, "de")).toBe("30. Sept. 2026")
      expect(formatDocumentDate(from, "en")).toBe("01 Sept 2026")
      expect(invoiceDayKey(to)).toBe("2026-09-30")
      // Due on the 10th, today the 10th (local noon) → due today, not a day late/early.
      expect(daysOverdue("2026-10-10T00:00:00.000Z", new Date(2026, 9, 10, 12))).toBe(0)
    })
  }
})

describe("invoice totals: one rule for the draft screen and the server", () => {
  it("sums ROUNDED lines (the €0.01 that went missing between draft and saved)", () => {
    const lines = [
      { quantity: 1.5, unitPrice: 33.33 },
      { quantity: 1.5, unitPrice: 33.33 },
    ]
    const t = invoiceTotals(lines, 0.2, 0)
    expect(t.subtotal).toBe(100)
    expect(t.taxAmount).toBe(20)
    expect(t.total).toBe(120)
  })

  it("agrees with the labour lines' own cents", () => {
    const lines = buildLabourLines(
      [
        { taskId: "a", taskTitle: "A", hours: 1.33, workerId: "w1", workerName: "Mark", billRateCents: 4575, costRateCents: null },
        { taskId: "b", taskTitle: "B", hours: 2.17, workerId: "w2", workerName: "Lisa", billRateCents: 3333, costRateCents: null },
      ],
      "task",
    )
    const sent = lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPriceCents / 100 }))
    expect(invoiceTotals(sent).subtotalCents).toBe(labourTotalCents(lines))
  })
})
