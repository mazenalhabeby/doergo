import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

/**
 * A list every second screen needs — roles, workflows, clients, workspaces — is read through ONE
 * hook, so it has one cache key and one refresh time. Nine copies each had drifted to four
 * different refresh times (1, 2 and 5 minutes, and none), and a copy can build its key and its
 * request from two different objects.
 */
const SRC = join(__dirname, "..")
const ONE_DOOR: Array<[RegExp, string]> = [
  [/organizationsApi\.getRoles\(/, "hooks/use-org-roles.ts"],
  [/workflowsApi\.list\(\)/, "hooks/use-workflows.ts"],
  [/customersApi\.list\(/, "hooks/use-clients.ts"],
  [/locationsApi\.list\(/, "lib/space-directory.ts"],
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) return e === "__tests__" || e === "node_modules" ? [] : walk(p)
    return /\.tsx?$/.test(e) ? [p] : []
  })
}

describe("shared reads go through their one hook", () => {
  const files = walk(SRC).map((f) => ({
    rel: relative(SRC, f),
    code: readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, ""),
  }))

  it.each(ONE_DOOR)("%s is called only from %s", (call, door) => {
    const callers = files.filter((f) => call.test(f.code)).map((f) => f.rel)
    expect(callers).toEqual([door])
  })
})
