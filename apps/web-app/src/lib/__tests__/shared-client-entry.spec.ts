import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

/**
 * The web imports VALUES from `@hbcfield/shared/client` only.
 *
 * ⚠️ The package root re-exports the NestJS pieces (Redis microservice config,
 * guards), and one value import from it drags `@nestjs/microservices` into the
 * browser bundle: every page that reaches it fails with "Can't resolve
 * 'perf_hooks'". It typechecks fine — only the dev server finds out. Type-only
 * imports are erased and are allowed.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

describe("web imports from @hbcfield/shared", () => {
  it("takes values from the browser entry, never the server barrel", () => {
    const root = join(__dirname, "..", "..")
    const offenders: string[] = []
    for (const f of files(root)) {
      const src = readFileSync(f, "utf8")
      const re = /import\s+(type\s+)?\{[^}]*\}\s+from\s+["']@hbcfield\/shared["']/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) if (!m[1]) offenders.push(f.slice(root.length + 1))
      if (/import\s+\*\s+as\s+\w+\s+from\s+["']@hbcfield\/shared["']/.test(src)) offenders.push(f.slice(root.length + 1))
    }
    expect(offenders).toEqual([])
  })
})
