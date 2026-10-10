import fs from "fs"
import path from "path"

import { buildKanbanColumns } from "@/hooks/use-org-workflow"
import { stepConfig } from "@/hooks/use-step-config"
import type { WorkflowStatus } from "@/lib/api"

/*
  The board's columns stayed in English in German: they read each step's stored
  `name`. A step copied from a shipped template carries `nameKey`; it is
  translated through it. A name somebody typed has no key and is kept as written.
*/
const de = JSON.parse(fs.readFileSync(path.join(__dirname, "../../i18n/locales/de.json"), "utf8"))
const t = (key: string, opts: { defaultValue: string }) =>
  key.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), de) ?? opts.defaultValue

const step = (key: string, name: string, nameKey: string | null, position: number): WorkflowStatus =>
  ({ id: key, key, name, nameKey, color: "#000", position, isFinal: false, isCanceled: false, transitions: [] }) as unknown as WorkflowStatus

const flow = [
  step("IN_PROGRESS", "In Progress", "workflowStatus.in_progress", 0),
  step("WAITING_PARTS", "Waiting for parts", null, 1),
]

describe("built-in step names follow the reader's language", () => {
  it("board columns: built-in translated, typed names as written", () => {
    const labels = buildKanbanColumns(flow, (s) => (s.nameKey ? t(s.nameKey, { defaultValue: s.name }) : s.name)).map((c) => c.label)
    expect(labels).toEqual(["In Arbeit", "Waiting for parts"])
  })

  it("with no translator, the stored name (unchanged behaviour)", () => {
    expect(buildKanbanColumns(flow).map((c) => c.label)).toEqual(["In Progress", "Waiting for parts"])
  })

  it("list badge: stepConfig translates through the key", () => {
    expect(stepConfig("IN_PROGRESS", flow, t).label).toBe("In Arbeit")
    expect(stepConfig("WAITING_PARTS", flow, t).label).toBe("Waiting for parts")
  })

  it("the board hooks pass the translator (useStepLabel), not the raw name", () => {
    const src = (p: string) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8")
    expect(src("app/(dashboard)/tasks/_hooks/use-task-workflow.ts")).toMatch(/buildKanbanColumns\(boardStatuses, stepLabel\)/)
    expect(src("app/(dashboard)/tasks/_components/kanban-board.tsx")).toMatch(/buildKanbanColumns\(workflowStatuses, stepLabel\)/)
  })
})
