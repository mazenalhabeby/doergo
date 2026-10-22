import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

/**
 * A destructive step is confirmed ONE way: `ConfirmDialog` (components/common). The browser's own
 * `confirm()` cannot be styled or translated around, blocks the page, and two of the five that
 * existed printed English to every reader ("Delete 3 tasks?").
 */
const SRC = join(__dirname, "..")

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) return e === "__tests__" || e === "node_modules" ? [] : walk(p)
    return /\.tsx?$/.test(e) ? [p] : []
  })
}

describe("one confirm", () => {
  const files = walk(SRC)

  it("walks the app (an empty walk would pass anything)", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("never calls the browser's confirm()", () => {
    const offenders = files
      .filter((f) => {
        const code = readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "")
        return /(^|[^.\w])(window\.)?confirm\(/.test(code)
      })
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })
})
