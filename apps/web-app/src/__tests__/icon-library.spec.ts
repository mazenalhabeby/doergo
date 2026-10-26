/**
 * ONE icon library (packages/shared/src/icons, Solar) for the web and the phone — decided 2026-10-26.
 *   • The shell (sidebar, top bar, account menu) draws only from it.
 *   • The stock set (lucide) is on its way out page by page: the number of files still importing it may only go
 *     DOWN. After replacing icons in a page, lower STOCK_ICON_FILES to the new count.
 *   • Nothing re-introduces a typed tick or a second icon component.
 */
import fs from "fs"
import path from "path"

const SRC = path.join(__dirname, "..")
/** Files that import lucide-react today. Lower it as pages move to the library — never raise it. */
const STOCK_ICON_FILES = 534

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "node_modules" ? [] : files(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}
const STOCK = /from ["']lucide-react["']/

describe("the icon library", () => {
  const all = files(SRC)

  it("the shell draws only from the library", () => {
    const shell = [
      ...files(path.join(SRC, "components/app-shell/sidebar")),
      ...files(path.join(SRC, "components/app-shell/nav")),
      ...[
        "top-bar.tsx",
        "top-bar-icon.tsx",
        "account-menu.tsx",
        "language-panel.tsx",
        "slide-panels.tsx",
        "approvals-button.tsx",
        "messages-button.tsx",
        "command-palette-button.tsx",
      ].map((f) => path.join(SRC, "components/app-shell", f)),
    ]
    const offenders = shell.filter((f) => STOCK.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it(`the stock icon set is used in no more files than before (${STOCK_ICON_FILES})`, () => {
    const using = all.filter((f) => STOCK.test(fs.readFileSync(f, "utf8"))).length
    expect(using).toBeLessThanOrEqual(STOCK_ICON_FILES)
  })

  it("the language list marks the chosen language with the library's check, not a typed tick", () => {
    const panel = fs.readFileSync(path.join(SRC, "components/app-shell/language-panel.tsx"), "utf8")
    expect(panel).toContain('<Icon name="selected"')
    expect(panel).not.toMatch(/["']✓["']/)
  })

  it("there is one web icon component: GradientIcon draws through Icon", () => {
    const gradient = fs.readFileSync(path.join(SRC, "components/ui/gradient-icon.tsx"), "utf8")
    expect(gradient).toContain("<Icon ")
    expect(gradient).not.toContain("dangerouslySetInnerHTML")
  })
})
