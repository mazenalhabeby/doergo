import fs from "fs"
import path from "path"
import { readSource } from "../test-utils/read-source"

/**
 * The product picks a date ONE way.
 *
 * ⚠️ It picked dates two ways and neither was shared. Four files carry ten
 * copies of the same Popover-plus-Calendar block, and thirty-two other fields
 * use a raw `<input type="date">` — which renders differently in every browser
 * and, in a narrow column, shows "dd.m" beside a clipped spinner. That is
 * exactly how it turned up on the invoice screen and how it was reported.
 *
 * Ten copies is also ten places to fix a bug in and ten chances to disagree
 * about the format, which they already do: the copies print "MMM d, yyyy" and
 * the native inputs print whatever the operating system prefers.
 *
 * `components/ui/date-picker.tsx` is the one way now. This test does not
 * rewrite the existing copies — it stops new ones, and names the ones that are
 * left so the debt is counted rather than forgotten.
 */
const SRC = path.join(process.cwd(), "src")

/** Comments quote the very patterns this forbids; a brace opens a JSX one. */
const code = (s: string) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue
      walk(p, out)
    } else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, "/")

/*
  The copies that predate the shared component. Each is a real migration with
  its own state shape — they hold `Date` objects where the shared one holds an
  ISO string — so they are listed rather than rewritten in one sweep.

  ⚠️ The list may only ever get SHORTER. Adding to it is the failure this test
  exists to prevent.
*/
const KNOWN_INLINE_PICKERS: string[] = [
  // Empty since step 5.4 of docs/plans/code-structure-fix.md: every copy now
  // renders the shared DatePicker. Nothing may be added back.
]

describe("one date picker", () => {
  const files = walk(SRC)

  it("finds the app's components (an empty walk would pass anything)", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("exists, and takes ISO in and ISO out", () => {
    /*
      ⚠️ A Date object would drag a timezone into a field that has none. The
      same trap as `formatCalendarDate` in shared, where an ISO date rendered
      through `new Date()` prints the day before anywhere west of Greenwich.
    */
    const src = readSource(path.join(SRC, "components/ui/date-picker.tsx"), "utf8")
    expect(src).toMatch(/value: string/)
    expect(src).toMatch(/onChange: \(value: string\) => void/)
    // Built from the LOCAL parts, never toISOString().
    expect(code(src)).not.toMatch(/toISOString\(\)/)
  })

  it("no NEW file builds its own Popover + Calendar", () => {
    const offenders = files
      .filter((f) => !rel(f).endsWith("components/ui/date-picker.tsx"))
      .filter((f) => {
        const s = code(fs.readFileSync(f, "utf8"))
        return s.includes('mode="single"') && s.includes("PopoverTrigger")
      })
      .map(rel)
      .filter((f) => !KNOWN_INLINE_PICKERS.includes(f))

    expect(offenders).toEqual([])
  })

  it("the known copies are still the known copies — the list only shrinks", () => {
    const current = files
      .filter((f) => {
        const s = code(fs.readFileSync(f, "utf8"))
        return s.includes('mode="single"') && s.includes("PopoverTrigger")
      })
      .map(rel)
      .filter((f) => !rel(f).endsWith("components/ui/date-picker.tsx"))

    // Every remaining copy must be one that was already there. A migration
    // removes an entry; nothing may add one.
    expect(current.filter((f) => !KNOWN_INLINE_PICKERS.includes(f))).toEqual([])
  })

  it("no screen uses the browser's own date input", () => {
    // Every field is the shared DatePicker now (5.4). A native one renders differently per browser.
    const offenders = files.filter((f) => /type="date"/.test(code(fs.readFileSync(f, "utf8")))).map(rel)
    expect(offenders).toEqual([])
  })

  it("the invoice screen uses the shared one", () => {
    // The page plus the pieces it was split into — the screen, not the file.
    const NEW = path.join(SRC, "app/(dashboard)/invoices/new")
    const s = [
      path.join(NEW, "page.tsx"),
      ...["_components", "_lib"].flatMap((d) =>
        fs
          .readdirSync(path.join(NEW, d))
          .filter((f) => /\.tsx?$/.test(f))
          .sort()
          .map((f) => path.join(NEW, d, f)),
      ),
    ]
      .map((f) => code(readSource(f, "utf8")))
      .join("\n")
    // The period is a range now — the shared PeriodPicker, built on the same Calendar.
    expect(s).toMatch(/<(DatePicker|PeriodPicker)\b/)
    // …and no native date input survived there.
    expect(s).not.toMatch(/type="date"/)
  })
})
