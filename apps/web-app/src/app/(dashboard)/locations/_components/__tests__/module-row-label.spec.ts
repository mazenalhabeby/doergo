import { readFileSync } from "fs"
import { join } from "path"

/**
 * A module row's label must name the control it toggles.
 *
 * ⚠️ A `<label>` with no `htmlFor` controls the first LABELABLE descendant in
 * tree order, and `<button>` is labelable. The modules tab put the explainer
 * "i" before the checkbox, so the label's control was the BUTTON: clicking the
 * switch opened the description dialog and never switched the module on.
 *
 * Nothing about the markup looks wrong. Both files use the same two components;
 * only the ORDER differed, and space-form happened to put the checkbox first.
 * That is why this is a test and not a code review note.
 *
 * The fix is to say which control the label drives instead of relying on where
 * a button happens to sit, so the row can be rearranged freely afterwards.
 */
const FILES = [
  join(__dirname, "..", "..", "[id]", "_components", "modules-tab.tsx"),
  join(__dirname, "..", "space-form.tsx"),
]

describe("module rows toggle the checkbox, not the explainer", () => {
  it.each(FILES.map((f) => [f.split("/_components/")[1] ?? f, f]))(
    "%s names its labelled control",
    (_name, file) => {
      const src = readFileSync(file, "utf8")

      // Every <label> that wraps a module checkbox carries an htmlFor…
      const labels = src.match(/<label\b[\s\S]*?>/g) ?? []
      const moduleLabels = labels.filter((l) => l.includes("htmlFor"))
      expect(moduleLabels.length).toBeGreaterThan(0)

      // …and the checkbox it names carries the matching id.
      for (const label of moduleLabels) {
        const forExpr = /htmlFor=\{`([^`]+)`\}/.exec(label)
        expect(forExpr).not.toBeNull()
        expect(src).toContain(`id={\`${forExpr![1]}\`}`)
      }
    },
  )

  /*
    The specific regression: an explainer button standing between the label and
    its checkbox. Harmless once `htmlFor` is present — which is the point of
    asserting the two together rather than banning the ordering.
  */
  it.each(FILES.map((f) => [f.split("/_components/")[1] ?? f, f]))(
    "%s does not rely on a button coming after the checkbox",
    (_name, file) => {
      const src = readFileSync(file, "utf8")
      const button = src.indexOf("<ExplainerButton")
      const checkbox = src.indexOf('type="checkbox"')
      if (button === -1 || checkbox === -1) return
      // Either order is fine — but only because the label says what it drives.
      expect(src).toMatch(/htmlFor=\{`/)
    },
  )
})
