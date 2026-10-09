import { toClientCopy } from "@hbcfield/shared/client"

import {
  availableToggles, formatReportMinutes, groupEventsByDay, loadClientInclude, loadOffToggles, normalizeInclude,
  pairPhotos, reportFileName, reportQueryKey, safeImageUrl, saveClientInclude, saveOffToggles, sectionNumbers,
  showPrices, visibleSections, workSteps, type Translate,
  HEAD_TOGGLES, availableHeadToggles, factRows, letterhead, loadHeadOff, loadIssuerChoice, reportFacts, reportPills,
  saveHeadOff, saveIssuerChoice, type HeadToggle,
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

describe("the query key carries the issuer", () => {
  it("a different company is a different report, in both copies", () => {
    expect(reportQueryKey("t1", "office", [], "le-2")).not.toEqual(reportQueryKey("t1", "office", []))
    expect(reportQueryKey("t1", "client", ["route"], "le-2")).not.toEqual(reportQueryKey("t1", "client", ["route"], "le-3"))
    expect(reportQueryKey("t1", "office", [], null)).toEqual(reportQueryKey("t1", "office", []))
  })
})

describe("the top of the report", () => {
  const when = (iso: string | null | undefined) => (iso ? `@${iso}` : "—")
  const none = new Set<HeadToggle>()

  it("every switch is ON by default (nothing stored = nothing off)", () => {
    window.localStorage.clear()
    expect(loadHeadOff("space-1").size).toBe(0)
  })

  it("is remembered per workspace, as a list of what is OFF, unknown keys dropped", () => {
    window.localStorage.clear()
    saveHeadOff("space-1", new Set<HeadToggle>(["logo", "worked"]))
    expect(JSON.parse(window.localStorage.getItem("hbc.jobReport.headOff.space-1")!)).toEqual(["logo", "worked"])
    window.localStorage.setItem("hbc.jobReport.headOff.space-2", JSON.stringify(["priority", "salary"]))
    expect([...loadHeadOff("space-1")]).toEqual(["logo", "worked"])
    expect([...loadHeadOff("space-2")]).toEqual(["priority"])
    expect(HEAD_TOGGLES).toHaveLength(16)
  })

  it("the issuer choice is remembered per workspace, and only while it is still offered", () => {
    window.localStorage.clear()
    const issuers = [{ id: "a", name: "A GmbH", isMain: true }, { id: "b", name: "B Inc.", isMain: false }]
    saveIssuerChoice("space-1", "b")
    expect(loadIssuerChoice("space-1", issuers)).toBe("b")
    expect(loadIssuerChoice("space-1", issuers.slice(0, 1))).toBeNull()
    expect(loadIssuerChoice("space-2", issuers)).toBeNull()
    saveIssuerChoice("space-1", null)
    expect(window.localStorage.getItem("hbc.jobReport.issuer.space-1")).toBeNull()
  })

  it("the letterhead: the name always, each line only while switched on", () => {
    const r = officeReport()
    r.header.issuer = { ...r.header.issuer, logoUrl: "https://files.example.com/logo.png", phone: "+43 1", taxId: "TX-1", registerNumber: "FN 1a" }
    const all = letterhead(r.header.issuer, none, t)
    expect(all.name).toBe("HBC GmbH")
    expect(all.logoUrl).toBe("https://files.example.com/logo.png")
    expect(all.lines).toEqual([
      "Hauptstrasse 1", "4663 Laakirchen", "+43 1  •  office@hbc.example",
      "tasks.report.vatId: ATU12345678", "tasks.report.taxId: TX-1", "tasks.report.register: FN 1a",
    ])
    const bare = letterhead(r.header.issuer, new Set<HeadToggle>(["logo", "address", "contact", "registration"]), t)
    expect(bare).toEqual({ name: "HBC GmbH", logoUrl: null, lines: [] })
  })

  it("labels: each one can be switched off, and an empty one is never a pill", () => {
    const r = officeReport()
    expect(reportPills(r, none, t).map((p) => p.key)).toEqual(["status", "priority", "taskType", "origin"])
    expect(reportPills(r, new Set<HeadToggle>(["priority", "origin"]), t).map((p) => p.key)).toEqual(["status", "taskType"])
    r.header.taskType = null
    r.request.origin = { kind: "INTERNAL", portalReference: null, recurringTemplate: null, parent: null }
    expect(reportPills(r, none, t).map((p) => p.key)).toEqual(["status", "priority"])
  })

  it("detail boxes: all eight for a full job, in grid order", () => {
    expect(reportFacts(officeReport(), none, t, when).map((f) => f.key)).toEqual([
      "client", "site", "equipment", "workspace", "due", "started", "finished", "worked",
    ])
  })

  it("an empty box is never printed, whatever its switch — worked time 0 included", () => {
    const r = officeReport()
    Object.assign(r.header, { client: null, contact: null, asset: null, dueDate: null, startedAt: null, startedBy: null, totalMinutes: 0 })
    r.header.site = { address: null, lat: null, lng: null }
    const facts = reportFacts(r, none, t, when)
    expect(facts.map((f) => f.key)).toEqual(["workspace", "finished"])
    expect(JSON.stringify(facts)).not.toContain("0 min")
  })

  it("the grid reflows with no gaps: rows of four, from what is left", () => {
    const r = officeReport()
    const off = new Set<HeadToggle>(["site", "due", "worked"])
    const facts = reportFacts(r, off, t, when)
    expect(facts).toHaveLength(5)
    const rows = factRows(facts, 4)
    expect(rows.map((row) => row.length)).toEqual([4, 1])
    expect(rows.flat().map((f) => f.key)).toEqual(["client", "equipment", "workspace", "started", "finished"])
    // Everything off: no grid at all.
    expect(factRows(reportFacts(r, new Set(HEAD_TOGGLES), t, when))).toEqual([])
  })

  it("offers a switch only for what this report has", () => {
    const r = officeReport()
    r.header.totalMinutes = 0
    r.header.asset = null
    const a = availableHeadToggles(r, t)
    expect(a.letterhead).toEqual(["address", "contact", "registration"]) // no logo
    expect(a.labels).toEqual(["status", "priority", "taskType", "origin"])
    expect(a.facts).not.toContain("worked")
    expect(a.facts).not.toContain("equipment")
  })
})
