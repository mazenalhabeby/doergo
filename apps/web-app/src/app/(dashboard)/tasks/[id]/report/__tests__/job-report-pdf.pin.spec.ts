/**
 * @jest-environment node
 */
import { createHash } from "crypto"

/*
  Pins EVERYTHING the job report PDF draws, in order.

  Recorded against the single-function builder before it was rewritten into
  steps. Every drawing call on the document — text and where it lands, fonts,
  colours, lines, boxes, images, page changes, including what autotable draws —
  goes into a log, and the finished file's bytes are hashed (creation date and
  file id removed). The rewrite must reproduce both exactly.

  The call log was compared in full once (the rewrite matched it); it is kept as
  a hash so the snapshot stays small — any changed call still changes the hash.
*/
const RECORDED = [
  "text",
  "addPage",
  "addImage",
  "setFont",
  "setFontSize",
  "setTextColor",
  "setDrawColor",
  "setFillColor",
  "setLineWidth",
  "line",
  "rect",
  "roundedRect",
  "circle",
  "setPage",
  "setLineCap",
  "setLineJoin",
] as const

const log: unknown[][] = []
const round = (v: unknown): unknown =>
  typeof v === "number"
    ? Math.round(v * 1e4) / 1e4
    : Array.isArray(v)
      ? v.map(round)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]))
        : typeof v === "string" && v.startsWith("data:")
          ? `data:…${v.length}`
          : v

jest.mock("jspdf", () => {
  const a = jest.requireActual("jspdf/dist/jspdf.node.min.js")
  function Recorded(this: unknown, ...args: unknown[]) {
    const doc = new a.jsPDF(...args)
    for (const name of RECORDED) {
      const real = doc[name].bind(doc)
      doc[name] = (...callArgs: unknown[]) => {
        log.push([name, ...callArgs.map(round)])
        return real(...callArgs)
      }
    }
    return doc
  }
  return { __esModule: true, default: Recorded, jsPDF: Recorded }
})

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

// Some photos load and some fail, so both drawing paths are pinned; the logo loads.
jest.mock("@/lib/pdf-common", () => {
  const actual = jest.requireActual("@/lib/pdf-common")
  return {
    ...actual,
    loadImage: jest.fn(async (url: string | null) =>
      url && /(p2|r1|r3|sig)/.test(url) ? { dataUrl: PNG, w: 4, h: 3, format: "PNG" } : null,
    ),
    loadLogo: jest.fn(async () => ({ dataUrl: PNG, w: 3, h: 1 })),
  }
})

import { toClientCopy, type TaskReport } from "@hbcfield/shared/client"

import { buildJobReportPdf } from "../_lib/job-report-pdf"
import { visibleSections, type NumberedSection, type Translate } from "../_lib/report-model"
import { ana, ben, officeReport } from "./fixture"

const t: Translate = (key, o) => (o ? `${key} ${JSON.stringify(o)}` : key)

const bytesHash = (raw: string) =>
  createHash("sha256")
    .update(raw.replace(/\/CreationDate \([^)]*\)/g, "").replace(/\/ID \[[^\]]*\]/g, ""))
    .digest("hex")

async function pin(
  report: TaskReport,
  opts: { visible?: readonly NumberedSection[]; showPrices?: boolean; headOff?: Set<never> } = {},
) {
  log.length = 0
  const progress: Array<[number, number]> = []
  const doc = await buildJobReportPdf({
    report,
    visible: opts.visible ?? visibleSections(report, new Set()),
    showPrices: opts.showPrices ?? true,
    t,
    locale: "en",
    generatedBy: "Anna Admin",
    headOff: opts.headOff,
    onProgress: (d, n) => progress.push([d, n]),
  })
  return {
    pages: doc.getNumberOfPages(),
    progress,
    calls: log.length,
    log: createHash("sha256").update(JSON.stringify(log)).digest("hex"),
    bytes: bytesHash(doc.output()),
  }
}

const ALL: NumberedSection[] = [
  "request",
  "work",
  "time",
  "photos",
  "checklist",
  "stepAnswers",
  "parts",
  "route",
  "history",
  "comments",
  "handovers",
  "documents",
  "details",
  "signatures",
] as NumberedSection[]

function emptyReport(): TaskReport {
  const r = officeReport()
  r.request = { ...r.request, description: null }
  r.work = { ...r.work!, workPerformed: null }
  r.time = { ...r.time!, byPerson: [], ownStops: [] }
  r.photos = []
  r.checklist = []
  r.stepAnswers = []
  r.parts = []
  r.route = { ...r.route!, points: [], matchedPath: null, arrivalDistanceMeters: null }
  r.history = []
  r.comments = []
  r.handovers = []
  r.documents = []
  r.details = []
  r.signatures = []
  return r
}

function longReport(): TaskReport {
  const r = officeReport()
  r.header.issuer = {
    ...r.header.issuer,
    logoUrl: "https://files.example.com/logo.png",
    phone: "+43 1 234",
    website: "hbc.example",
  }
  r.header.title = "A very long job title that needs more than one line on the page to be printed in full, twice over"
  r.work = {
    ...r.work!,
    workPerformed: Array.from({ length: 30 }, (_, i) => `${i + 1}. Step number ${i + 1} of the work`).join("\n"),
  }
  r.photos = [
    ...r.photos!,
    ...Array.from({ length: 7 }, (_, i) => ({
      ...r.photos![2]!,
      id: `r${i}`,
      url: `https://files.example.com/r${i}.jpg`,
      caption: i % 2 ? `Caption ${i}` : null,
      source: (i === 3 ? "STEP" : "TASK") as never,
      fieldLabel: i === 3 ? "Meter reading" : null,
    })),
  ]
  r.checklist = Array.from({ length: 40 }, (_, i) => ({
    id: `k${i}`,
    text: `Item ${i}`,
    isCompleted: i % 3 === 0,
    owner: i % 4 ? null : ana,
    completedBy: i % 3 === 0 ? ben : null,
    completedAt: i % 3 === 0 ? "2026-10-09T09:00:00.000Z" : null,
  }))
  r.history = Array.from({ length: 80 }, (_, i) => ({
    id: `e${i}`,
    type: "COMMENT_ADDED",
    at: new Date(Date.UTC(2026, 9, 8 + Math.floor(i / 30), 6, i)).toISOString(),
    actor: i % 2 ? ana : null,
    refs: {},
    data: {},
  })) as never
  r.meta = { ...r.meta, historyTruncated: true }
  r.comments = Array.from({ length: 12 }, (_, i) => ({
    id: `c${i}`,
    content: `Comment ${i} `.repeat(40),
    createdAt: "2026-10-09T09:00:00.000Z",
    author: i % 2 ? ben : null,
  })) as never
  r.signatures = [
    ...r.signatures!,
    ...Array.from({ length: 5 }, (_, i) => ({
      ...r.signatures![1]!,
      url: `https://files.example.com/sig${i}.png`,
      signedAt: null,
    })),
  ]
  return r
}

describe("job report PDF — pinned drawing", () => {
  it("the office copy, every section", async () => {
    expect(await pin(officeReport())).toMatchSnapshot()
  })

  it("the client copy, no prices", async () => {
    const client = toClientCopy(officeReport())
    expect(await pin(client, { showPrices: false })).toMatchSnapshot()
  })

  it("every section asked for, every section empty", async () => {
    expect(await pin(emptyReport(), { visible: ALL })).toMatchSnapshot()
  })

  it("a long report that breaks across pages, with a logo", async () => {
    expect(await pin(longReport())).toMatchSnapshot()
  })

  it("letterhead lines, labels and boxes switched off", async () => {
    const r = officeReport()
    r.header.issuer = { ...r.header.issuer, phone: "+43 699 777", registerNumber: "FN 424242x" }
    expect(
      await pin(r, {
        headOff: new Set(["contact", "registration", "taskType", "workspace", "status", "priority"]) as never,
      }),
    ).toMatchSnapshot()
  })
})
