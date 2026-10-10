import fs from "fs"
import path from "path"
import { resolveEndpoint, isLoopbackUrl } from "../endpoints"
import { sessionUserFrom, loginPathFor } from "@/contexts/auth-context"

describe("resolveEndpoint", () => {
  const fb = { development: "http://localhost:4001", production: undefined }

  it("a configured value wins, trailing slash removed", () => {
    expect(resolveEndpoint("https://x.example/", fb, true)).toBe("https://x.example")
  })
  it("development falls back to the local service", () => {
    expect(resolveEndpoint(undefined, fb, false)).toBe("http://localhost:4001")
  })
  it("a production build NEVER falls back to localhost — same origin instead", () => {
    expect(resolveEndpoint(undefined, fb, true)).toBeUndefined()
    expect(resolveEndpoint("  ", { development: "http://localhost:4000/api/v1", production: "/api/v1" }, true)).toBe("/api/v1")
    expect(isLoopbackUrl(resolveEndpoint(undefined, fb, true))).toBe(false)
  })
})

describe("one place for base URLs", () => {
  const SRC = path.resolve(__dirname, "../..")
  function* walk(dir: string): Generator<string> {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== "__tests__" && e.name !== "node_modules") yield* walk(full)
      } else if (/\.tsx?$/.test(e.name)) yield full
    }
  }
  const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

  it("no file but lib/endpoints.ts reads the API / auth / socket URLs from the environment", () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f)
      if (rel === path.join("lib", "endpoints.ts")) continue
      const code = stripComments(fs.readFileSync(f, "utf8"))
      if (/NEXT_PUBLIC_(API|AUTH|SOCKET)_URL|localhost:400\d/.test(code)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it("nothing keeps the access token in web storage", () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const code = stripComments(fs.readFileSync(f, "utf8"))
      if (/(localStorage|sessionStorage)\.setItem\([^)]*(access_?token|platformKey)/i.test(code)) offenders.push(path.relative(SRC, f))
    }
    expect(offenders).toEqual([])
  })
})

describe("session user", () => {
  it("takes the server's canCreateTasks instead of recomputing it", () => {
    const base = { id: "u", email: "e", firstName: "a", lastName: "b", canViewAllTasks: true, canAssignTasks: true, canManageUsers: false }
    expect(sessionUserFrom({ ...base, role: "EMPLOYEE", canCreateTasks: false, taskCreationScope: "SPACE" }).canCreateTasks).toBe(false)
    expect(sessionUserFrom({ ...base, role: "EMPLOYEE", canCreateTasks: true, canViewAllTasks: false }).canCreateTasks).toBe(true)
    // Only a token from before the field existed falls back to the scope.
    expect(sessionUserFrom({ ...base, role: "EMPLOYEE", taskCreationScope: "NONE" }).canCreateTasks).toBe(false)
  })

  it("sends an ended session to sign-in with its reason", () => {
    expect(loginPathFor("suspended")).toBe("/login?session=suspended")
    expect(loginPathFor("expired")).toBe("/login?session=expired")
    expect(loginPathFor("signed-out")).toBe("/login")
  })
})
