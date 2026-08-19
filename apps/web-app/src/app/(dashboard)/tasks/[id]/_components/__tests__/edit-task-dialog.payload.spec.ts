import { readFileSync } from "fs"
import { join } from "path"

/**
 * Everything the Edit Task dialog collects must reach the server.
 *
 * The sibling guard on the New Task dialog exists because three fields were
 * found being dropped there, one at a time, each by a person noticing the
 * result was wrong. This dialog had a worse version of the same defect: it
 * edited the address as plain text and never touched the coordinates, so a task
 * could read one place while its pin — and the route a member is navigated
 * along — still pointed at the previous one. Wrong data is worse than missing
 * data, because nothing looks broken.
 *
 * Source is read rather than rendered: the defect is structural, so no test
 * renderer to add and no markup to assert on.
 */
const DIALOG = join(__dirname, "..", "edit-task-dialog.tsx")
const SRC = readFileSync(DIALOG, "utf8")

/** State that deliberately never leaves the browser. Keep the reasons. */
const UI_ONLY_STATE: Record<string, string> = {}

/**
 * The argument of the update call, matched by counting braces — slicing to the
 * first "})" cuts the region short at any nested object in the payload.
 */
function payload(): string {
  const call = SRC.indexOf("updateMutation.mutate({")
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
  throw new Error("Unbalanced braces in the update payload")
}

describe("Edit Task dialog — nothing collected is thrown away", () => {
  const stateNames = [...new Set(
    [...SRC.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1]),
  )]

  it("finds the dialog's state (so the regex cannot pass by matching nothing)", () => {
    expect(stateNames.length).toBeGreaterThan(8)
    expect(stateNames).toContain("title")
    expect(stateNames).toContain("locationLat")
  })

  it.each(
    [...new Set([...SRC.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1]))]
      .filter((n) => !(n in UI_ONLY_STATE))
      .map((n) => [n] as [string]),
  )("submits %s", (name) => {
    expect(payload()).toContain(name)
  })

  it("keeps the UI-only list honest — every entry still exists", () => {
    for (const name of Object.keys(UI_ONLY_STATE)) {
      expect(stateNames).toContain(name)
    }
  })

  it("changes the address and the map pin together", () => {
    // The bug: the address was a free-text Input and the coordinates were never
    // read or sent, so editing one left the other pointing somewhere else.
    expect(payload()).toContain("locationAddress")
    expect(payload()).toContain("locationLat")
    expect(payload()).toContain("locationLng")
    expect(SRC).toContain("LocationPicker")
  })

  it("re-reads the task when the dialog reopens", () => {
    // Otherwise a second edit starts from whatever the last one left on screen.
    const reset = SRC.slice(SRC.indexOf("useEffect"), SRC.indexOf("const handleSubmit"))
    for (const field of ["setTitle", "setLocationAddress", "setLocationLat", "setLocationLng"]) {
      expect(reset).toContain(field)
    }
  })

  it("leaves no control bound without a way to change it", () => {
    const selects = [...SRC.matchAll(/<Select\b[^>]*>/g)].map((m) => m[0])
    expect(selects.length).toBeGreaterThan(0)
    for (const tag of selects) {
      expect(tag).toMatch(/value=/)
      expect(tag).toMatch(/onValueChange=/)
    }
  })

  it("says so when saving fails", () => {
    // A dialog that closes on failure looks exactly like one that succeeded.
    expect(SRC).toMatch(/onError/)
    expect(SRC).toMatch(/notify\.error/)
  })
})
