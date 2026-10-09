import { toClientCopy } from "@hbcfield/shared/client"

import {
  availableToggles, formatReportMinutes, groupEventsByDay, loadClientInclude, loadOffToggles, normalizeInclude,
  pairPhotos, reportFileName, reportQueryKey, safeImageUrl, saveClientInclude, saveOffToggles, sectionNumbers,
  showPrices, visibleSections, workSteps, type Translate,
} from "../_lib/report-model"
import { officeReport } from "./fixture"

/** A `t` that shows which key and values it was asked for. */
const t: Translate = (key, o) => {
  const units: Record<string, string> = {
    "tasks.report.units.minutes": `${o?.m} min`,
    "tasks.report.units.hours": `${o?.h} h`,
    "tasks.report.units.hoursMinutes": `${o?.h} h ${o?.m} min`,
  }
  return units[key] ?? key
}

describe("which sections print, and their numbers", () => {
  it("prints every section the office copy has, numbered from 1 without gaps", () => {
    const r = officeReport()
    const visible = visibleSections(r, new Set())
    expect(visible).toEqual([
      "request", "work", "time", "photos", "checklist", "stepAnswers", "parts", "route", "history", "comments", "handovers", "documents", "details", "signatures",
    ])
    const n = sectionNumbers(visible)
    expect(n.request).toBe(1)
    expect(n.signatures).toBe(14)
  })

  it("renumbers when a section is switched off — no gap is left behind", () => {
    const visible = visibleSections(officeReport(), new Set(["time", "photos"]))
    expect(visible).not.toContain("time")
    expect(sectionNumbers(visible).checklist).toBe(3)
  })

  it("one switch covers comments AND handover notes", () => {
    const visible = visibleSections(officeReport(), new Set(["notes"]))
    expect(visible).not.toContain("comments")
    expect(visible).not.toContain("handovers")
  })

  it("skips a section that is present but empty, and offers no switch for it", () => {
    const r = officeReport()
    r.checklist = []
    expect(visibleSections(r, new Set())).not.toContain("checklist")
    expect(availableToggles(r)).not.toContain("checklist")
  })

  it("does not count a comment event as history (comments are their own section)", () => {
    const r = officeReport()
    r.history = r.history.filter((e) => e.type === "COMMENT_ADDED")
    expect(visibleSections(r, new Set())).not.toContain("history")
  })
})

describe("which switches each copy offers", () => {
  it("the office copy offers prices, route and comments & handovers", () => {
    const toggles = availableToggles(officeReport())
    expect(toggles).toEqual(expect.arrayContaining(["partPrices", "route", "notes"]))
  })

  it("the default client copy offers none of them — the server never sent them", () => {
    const client = toClientCopy(officeReport())
    const toggles = availableToggles(client)
    expect(toggles).not.toContain("partPrices")
    expect(toggles).not.toContain("route")
    expect(toggles).not.toContain("notes")
    expect(toggles).toContain("parts")
    expect(showPrices(client, new Set())).toBe(false)
  })

  it("a client copy with prices and comments added back offers their switches", () => {
    const client = toClientCopy(officeReport(), ["partPrices", "comments"])
    const toggles = availableToggles(client)
    expect(toggles).toContain("partPrices")
    expect(toggles).toContain("notes")
    expect(showPrices(client, new Set())).toBe(true)
    expect(showPrices(client, new Set(["partPrices"]))).toBe(false)
  })
})

describe("minutes as a timesheet reads them", () => {
  it.each([
    [574, "9 h 34 min"],
    [45, "45 min"],
    [180, "3 h"],
    [0, "0 min"],
    [59.6, "1 h"],
    [null, "0 min"],
  ])("%p → %p", (min, out) => {
    expect(formatReportMinutes(min as number | null, t)).toBe(out)
  })
})

describe("the history by day, in the workspace's zone", () => {
  it("puts 21:30 UTC on the NEXT day in Vienna and reads the wall clock there", () => {
    const days = groupEventsByDay(officeReport().history, "Europe/Vienna")
    // 2026-10-08T21:30Z is 23:30 in Vienna (CEST) — still the 8th.
    expect(days[0]).toMatchObject({ day: "2026-10-08" })
    expect(days[0]!.items[0]!.time).toBe("23:30")
    expect(days[1]!.day).toBe("2026-10-09")
    expect(days[1]!.items.map((i) => i.event.id)).toEqual(["e2", "e4"])
  })

  it("the same instant falls on the next day further east", () => {
    const days = groupEventsByDay(officeReport().history, "Asia/Tokyo")
    expect(days[0]!.day).toBe("2026-10-09")
    expect(days[0]!.items[0]!.time).toBe("06:30")
  })
})

describe("photos", () => {
  it("pairs before with after and keeps the rest for the grid", () => {
    const { pairs, rest } = pairPhotos(officeReport().photos!)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.before.id).toBe("p1")
    expect(pairs[0]!.after.id).toBe("p2")
    expect(rest.map((p) => p.id)).toEqual(["p3"])
  })

  it("never drops an unmatched before or after", () => {
    const photos = officeReport().photos!
    const extra = { ...photos[0]!, id: "p4" }
    const { pairs, rest } = pairPhotos([...photos, extra])
    expect(pairs).toHaveLength(1)
    expect(rest.map((p) => p.id)).toEqual(["p3", "p4"])
  })

  it("draws only http(s) links and PNG/JPEG data URLs", () => {
    expect(safeImageUrl("https://x.example/a.jpg")).toBe("https://x.example/a.jpg")
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA")
    expect(safeImageUrl("javascript:alert(1)")).toBeNull()
    expect(safeImageUrl("data:image/svg+xml;base64,AAAA")).toBeNull()
    expect(safeImageUrl(null)).toBeNull()
  })
})

describe("the file name", () => {
  it("is Client_Job-REF_day, transliterated, the day in the workspace's zone", () => {
    expect(reportFileName(officeReport(), "Job")).toBe("Mueller-and-Soehne_Job-AB12CD_2026-10-09.pdf")
  })

  it("uses the generated day for an unfinished job, and works with no client", () => {
    const r = officeReport()
    r.header.finishedAt = null
    r.header.client = null
    r.meta.generatedAt = "2026-10-10T22:30:00.000Z" // 00:30 on the 11th in Vienna
    expect(reportFileName(r, "Auftrag")).toBe("Auftrag-AB12CD_2026-10-11.pdf")
  })
})

describe("work performed as steps", () => {
  it("reads numbered or one-per-line text as steps, a single line as a paragraph", () => {
    expect(workSteps("1. Drained\n2) Replaced\n- Refilled")).toEqual(["Drained", "Replaced", "Refilled"])
    expect(workSteps("Replaced the pump.")).toBeNull()
    expect(workSteps(null)).toBeNull()
  })
})

describe("remembered per workspace", () => {
  beforeEach(() => window.localStorage.clear())

  it("keeps the switches turned off, per workspace", () => {
    saveOffToggles("space-1", new Set(["photos", "route"]))
    expect([...loadOffToggles("space-1")].sort()).toEqual(["photos", "route"])
    expect(loadOffToggles("space-2").size).toBe(0)
  })

  it("keeps what is added to the client copy, sorted, ignoring unknown keys", () => {
    saveClientInclude("space-1", ["route", "comments", "route"])
    window.localStorage.setItem("hbc.jobReport.include.space-2", JSON.stringify(["comments", "salary"]))
    expect(loadClientInclude("space-1", ["comments", "route"])).toEqual(["comments", "route"])
    expect(loadClientInclude("space-2", ["comments", "route"])).toEqual(["comments"])
  })

  it("survives storage that throws", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    expect(loadOffToggles("space-1").size).toBe(0)
    spy.mockRestore()
  })
})

describe("the query key", () => {
  it("includes the client copy's choices in a stable order, and not the office copy's", () => {
    expect(reportQueryKey("t1", "client", ["route", "comments"])).toEqual(reportQueryKey("t1", "client", ["comments", "route"]))
    expect(reportQueryKey("t1", "client", ["route"])).not.toEqual(reportQueryKey("t1", "client", []))
    expect(reportQueryKey("t1", "office", ["route"])).toEqual(reportQueryKey("t1", "office", []))
    expect(normalizeInclude(["route", "comments", "route"])).toEqual(["comments", "route"])
  })
})
