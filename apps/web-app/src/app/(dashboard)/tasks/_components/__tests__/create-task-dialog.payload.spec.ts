import { readFileSync } from "fs"
import { join } from "path"

/**
 * Everything the New Task dialog collects must reach the server.
 *
 * Three fields were found being silently dropped, one after another: the
 * assignee (an uncontrolled Select that stored nothing), the map coordinates on
 * a recurring task, and a failed attachment upload. All the same shape — the
 * dialog accepted something from the person using it, and nothing on screen
 * said it had gone nowhere. Each was found by a person creating a task and
 * noticing the result was wrong.
 *
 * This reads the dialog's source rather than rendering it: the defect is
 * structural — state held that the submit path never mentions — and that is
 * visible without a DOM, without new dependencies, and without the brittleness
 * of asserting on markup.
 *
 * When this fails, the fix is usually to submit the new field. If it genuinely
 * belongs only on screen, add it to UI_ONLY_STATE with a reason. Either way it
 * becomes a decision someone made rather than an omission nobody noticed.
 */
const DIALOG = join(__dirname, "..", "create-task-dialog.tsx")
const SRC = readFileSync(DIALOG, "utf8")

/**
 * State that deliberately never leaves the browser. Each entry is a claim that
 * this field is presentational — keep the reasons, they are what makes the
 * exception reviewable.
 */
const UI_ONLY_STATE: Record<string, string> = {
  open: "the dialog's own visibility",
  isDragOver: "drag-and-drop highlight for the file dropzone",
  isSubmittingLocal: "disables the form while the request is in flight",
  newChecklistItem: "the text being typed before it becomes a checklist item",
  isRecurring: "chooses WHICH payload is sent, rather than being a field in one",
}

/**
 * The dialog submits down TWO paths — a one-off task, and a recurring template
 * — and a field can be dropped from one while surviving in the other. The first
 * version of this test looked at a single region and passed while the assignee
 * was missing from the one-off payload, because it was still present in the
 * recurring one. Each path is examined on its own.
 */
/**
 * The argument of a `…mutate({ … })` call, matched by counting braces.
 *
 * Slicing to the first "})" was wrong: a payload line like
 * `checklist.map((text) => ({ text }))` closes a brace of its own and cut the
 * region short, so fields below it looked absent when they were there. A test
 * that reads source has to parse it as carefully as it judges it.
 */
function payloadOf(marker: string): string {
  const call = SRC.indexOf(marker)
  expect(call).toBeGreaterThan(-1)
  const open = SRC.indexOf("{", call)
  let depth = 0
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++
    else if (SRC[i] === "}") {
      depth--
      if (depth === 0) return SRC.slice(open, i + 1)
    }
  }
  throw new Error(`Unbalanced braces after ${marker}`)
}

function oneOffPath(): string {
  // The create mutation's definition too — attachments are uploaded in its
  // onSuccess, after the task exists, rather than in the payload.
  const defStart = SRC.indexOf("const createMutation")
  const defEnd = SRC.indexOf("const handleSubmit")
  expect(defStart).toBeGreaterThan(-1)
  expect(defEnd).toBeGreaterThan(defStart)
  return SRC.slice(defStart, defEnd) + payloadOf("createMutation.mutate({")
}

function recurringPath(): string {
  return payloadOf("recurringMutation.mutate({")
}

/** Fields that belong to a one-off task only — a template has no due date. */
const ONE_OFF_ONLY = new Set([
  "dueDate", "startDate", "phaseId", "sprintId", "epicId", "storyPoints",
  "parentTaskId", "customFieldValues", "attachments", "locationLat", "locationLng",
])

/** Fields that describe a repeat, and exist nowhere else. */
const RECURRING_ONLY = new Set([
  "frequency", "customDays", "dayOfWeek", "dayOfMonth", "recurStart", "recurEnd",
])

describe("New Task dialog — nothing collected is thrown away", () => {
  const stateNames = [...SRC.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1])

  it("finds the dialog's state (guards against the regex silently matching nothing)", () => {
    // If a refactor changes how state is declared, this test must fail loudly
    // rather than pass by examining an empty list.
    expect(stateNames.length).toBeGreaterThan(15)
    expect(stateNames).toContain("title")
    expect(stateNames).toContain("assigneeIds")
  })

  it.each(
    [...new Set([...SRC.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1]))]
      .filter((n) => !(n in UI_ONLY_STATE))
      .map((n) => [n] as [string]),
  )("sends %s to the server, on every path that carries it", (name) => {
    if (RECURRING_ONLY.has(name)) {
      expect(recurringPath()).toContain(name)
      return
    }
    // Everything else must reach the one-off path…
    expect(oneOffPath()).toContain(name)
    // …and the recurring one too, unless it is meaningless for a template.
    if (!ONE_OFF_ONLY.has(name)) {
      expect(recurringPath()).toContain(name)
    }
  })

  it("keeps the UI-only list honest — every entry still exists", () => {
    // An entry left behind after its state was removed is a hole: the next
    // field with that name would be exempted without anyone deciding to.
    for (const name of Object.keys(UI_ONLY_STATE)) {
      expect(stateNames).toContain(name)
    }
  })

  it("sends the recurring payload the coordinates, not just the address", () => {
    // The bug: a repeating task carried the place written out and no point on
    // the map, so every task it generated had nothing to route to.
    const recurringStart = SRC.indexOf("recurringMutation.mutate({")
    const recurring = SRC.slice(recurringStart, SRC.indexOf("})", recurringStart))
    expect(recurring).toContain("locationAddress")
    expect(recurring).toContain("locationLat")
    expect(recurring).toContain("locationLng")
  })

  it("leaves no control bound without a way to change it", () => {
    // The assignee Select had a list of members, no value and no
    // onValueChange: it looked like a working control and stored nothing.
    const selects = [...SRC.matchAll(/<Select\b[^>]*>/g)].map((m) => m[0])
    expect(selects.length).toBeGreaterThan(0)
    for (const tag of selects) {
      expect(tag).toMatch(/value=/)
      expect(tag).toMatch(/onValueChange=/)
    }
  })

  it("tells the person when an attachment did not upload", () => {
    // It used to reach console.error alone, under a success toast.
    const onSuccess = SRC.slice(SRC.indexOf("onSuccess: async (task)"), SRC.indexOf("onError:"))
    expect(onSuccess).toContain("failedUploads")
    expect(onSuccess).toMatch(/notify\.error/)
  })
})
