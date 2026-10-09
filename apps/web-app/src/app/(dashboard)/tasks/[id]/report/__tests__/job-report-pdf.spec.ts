/**
 * @jest-environment node
 */
jest.mock("jspdf", () => { const a = jest.requireActual("jspdf/dist/jspdf.node.min.js"); return { __esModule: true, default: a.jsPDF, jsPDF: a.jsPDF } })
import { toClientCopy } from "@hbcfield/shared/client"

import { buildJobReportPdf } from "../_lib/job-report-pdf"
import { visibleSections, type Translate } from "../_lib/report-model"
import { officeReport } from "./fixture"

/** Keys come back as the last segment, so the PDF's words can be found in its bytes. */
const t: Translate = (key, o) => {
  if (key === "tasks.report.page") return `Page ${o?.page} of ${o?.pages}`
  if (key === "tasks.report.units.hoursMinutes") return `${o?.h} h ${o?.m} min`
  if (key === "tasks.report.photos.unavailable") return "Photo unavailable"
  return key.split(".").pop()!
}

/** Every image fails to load, as a CORS refusal would. */
beforeAll(() => {
  ;(globalThis as { Image?: unknown }).Image = class { set src(_v: string) { setTimeout(() => (this as unknown as { onerror?: () => void }).onerror?.(), 0) } } as never
})

describe("the job report PDF", () => {
  it("draws the letterhead, every visible section and page x of y — and survives every photo failing", async () => {
    const r = officeReport()
    const progress: Array<[number, number]> = []
    const doc = await buildJobReportPdf({
      report: r, visible: visibleSections(r, new Set()), showPrices: true, t, locale: "en", generatedBy: "Anna Admin",
      onProgress: (d, n) => progress.push([d, n]),
    })
    const raw = doc.output()
    expect(raw).toContain("HBC GmbH")
    expect(raw).toContain("#AB12CD")
    expect(raw).toContain("Boiler service")
    expect(raw).toContain("Internal: client was rude")
    expect(raw).toContain("Photo unavailable")
    expect(raw).toMatch(/Page 1 of \d/)
    // 3 photos + 1 step signature were attempted, and progress said so.
    expect(progress[progress.length - 1]).toEqual([4, 4])
  })

  it("prints only what the client copy carries — a comment the server cut cannot appear", async () => {
    const client = toClientCopy(officeReport())
    const doc = await buildJobReportPdf({ report: client, visible: visibleSections(client, new Set()), showPrices: false, t, locale: "en", generatedBy: "Anna Admin" })
    const raw = doc.output()
    expect(raw).not.toContain("Internal: client was rude")
    expect(raw).not.toContain("Left the old pump in the van")
    expect(raw).not.toContain("Waiting for the secret part")
    expect(raw).toContain("Boiler service")
  })

  it("leaves out a section switched off on the screen", async () => {
    const r = officeReport()
    const doc = await buildJobReportPdf({ report: r, visible: visibleSections(r, new Set(["notes"])), showPrices: true, t, locale: "en", generatedBy: "x" })
    expect(doc.output()).not.toContain("Internal: client was rude")
  })
})
