import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

/*
  The workspace list is ONE request, `useSpaceDirectory` / `useActiveSpaces`
  (lib/space-directory). Twelve surfaces each called `locationsApi.list` with
  their own parameters under five different cache keys — and a bare call stopped
  at the server's page size (20), so an organization with more workspaces saw a
  short picker with nothing saying so (audit 2026-10-16).
*/
describe("the workspace list is fetched in one place", () => {
  const SRC = join(__dirname, "..", "..")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name !== "__tests__" && name !== "node_modules") walk(p)
      } else if (/\.tsx?$/.test(p) && !/\.spec\.tsx?$/.test(p)) files.push(p)
    }
  }
  walk(SRC)

  it("only lib/space-directory calls locationsApi.list", () => {
    const offenders = files
      .filter((f) => !f.endsWith(join("lib", "space-directory.ts")))
      .filter((f) => /locationsApi\.list\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f))
    expect(files.length).toBeGreaterThan(300)
    expect(offenders).toEqual([])
  })
})
