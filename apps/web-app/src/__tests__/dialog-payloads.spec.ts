import { readFileSync } from "fs"
import { join } from "path"

/**
 * Nothing a dialog collects may be thrown away.
 *
 * Four fields were found being dropped or corrupted across the two task
 * dialogs, one at a time, each by a person using the feature and noticing the
 * result was wrong: an assignee stored nowhere, a recurring task's coordinates,
 * a silent attachment failure, and an address edited while its map pin stayed
 * behind. All the same shape — something accepted from the person using the
 * screen that never reached the server, with nothing saying so.
 *
 * The task dialogs each got their own guard because each has specific things
 * worth pinning. This is the general one: a table, so covering another dialog
 * is a row rather than a fourth copy of the same file.
 *
 * It reads source rather than rendering. The defect is structural — state held
 * that the submit path never mentions — so it needs no test renderer and makes
 * no assertions about markup that changes for cosmetic reasons.
 */

interface DialogUnderTest {
  name: string
  path: string
  /**
   * The submit FUNCTION, not one payload object.
   *
   * The first version matched the object literal after a marker, and the
   * invitation dialog builds its input field by field AFTER declaring it —
   * so the region held `{ targetRole }` and every real field looked dropped.
   * Matching the function body covers however the payload is assembled, and
   * however many calls it makes.
   */
  submitFn: string
  /** State that deliberately stays in the browser. Keep the reasons — they are
   *  what makes each exception reviewable rather than a way to silence a test. */
  uiOnly: Record<string, string>
}

const DIALOGS: DialogUnderTest[] = [
  {
    name: "Create invitation",
    path: "components/invitations/create-invitation-dialog.tsx",
    submitFn: "const handleSubmit",
    uiOnly: {
      mode: "chooses whether an email is collected; shapes the payload rather than being in it",
      accessOpen: "whether the access section is expanded",
      accessTouched: "stops the position preset overwriting choices the admin has made",
      generatedCode: "the code returned AFTER creation, shown for copying",
      success: "swaps the form for the result panel",
      codeCopied: "the tick shown for a moment after copying",
    },
  },
  {
    name: "Edit member",
    path: "app/(dashboard)/members/_components/edit-member-dialog.tsx",
    submitFn: "const handleSave",
    uiOnly: {
      open: "a combobox's own open state",
      inputValue: "the text being typed in that combobox before it is committed",
      copied: "the tick shown for a moment after copying",
      tempPassword: "the password returned BY a reset, shown once for copying",
    },
  },
  {
    name: "Space form",
    path: "app/(dashboard)/locations/_components/space-form.tsx",
    submitFn: "const handleSubmit",
    uiOnly: {
      type: "workspace vs physical — decides WHICH fields are sent, rather than being one",
      showAdvanced: "whether the advanced section is expanded",
    },
  },
]

/** The body of the function named by a marker, matched by counting braces —
 *  slicing to the first "})" cuts short at any nested object inside it. */
function regionAfter(src: string, marker: string): string {
  const at = src.indexOf(marker)
  if (at === -1) return ""
  const open = src.indexOf("{", at)
  if (open === -1) return ""
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return src.slice(open)
}

describe.each(DIALOGS.map((d) => [d.name, d] as [string, DialogUnderTest]))(
  "%s — nothing collected is thrown away",
  (_name, dialog) => {
    const SRC = readFileSync(join(__dirname, "..", dialog.path), "utf8")
    const stateNames = [
      ...new Set([...SRC.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1])),
    ]
    const submitted = regionAfter(SRC, dialog.submitFn)

    it("finds state and a submit path, so it cannot pass by examining nothing", () => {
      expect(stateNames.length).toBeGreaterThan(3)
      expect(SRC).toContain(dialog.submitFn)
      expect(submitted.length).toBeGreaterThan(80)
    })

    it("submits every field it collects", () => {
      const dropped = stateNames.filter((n) => !(n in dialog.uiOnly) && !submitted.includes(n))
      // Named, so a failure says WHICH field is being lost.
      expect(dropped).toEqual([])
    })

    it("keeps its UI-only list honest — every entry still exists", () => {
      // An entry left behind after its state was deleted is a hole: the next
      // field to take that name would be exempted without anyone deciding to.
      for (const name of Object.keys(dialog.uiOnly)) {
        expect(stateNames).toContain(name)
      }
    })

    it("leaves no control bound without a way to change it", () => {
      // The assignee Select had a member list, no value and no onValueChange:
      // it looked like a working control and stored nothing.
      for (const tag of [...SRC.matchAll(/<Select\b[^>]*>/g)].map((m) => m[0])) {
        expect(tag).toMatch(/value=/)
        expect(tag).toMatch(/onValueChange=/)
      }
      for (const tag of [...SRC.matchAll(/<(?:Input|Textarea)\b[^>]*>/g)].map((m) => m[0])) {
        if (!/value=/.test(tag)) continue // uncontrolled by design (file pickers)
        // A readOnly field shows something back — a generated code, a temporary
        // password — rather than collecting it. Nothing to change.
        if (/readOnly|disabled=\{true\}/.test(tag)) continue
        expect(tag).toMatch(/onChange=/)
      }
    })

    it("says so when saving fails", () => {
      // A dialog that closes on failure looks exactly like one that succeeded.
      expect(SRC).toMatch(/onError/)
      expect(SRC).toMatch(/notify\.error|toast\.error/)
    })
  },
)
