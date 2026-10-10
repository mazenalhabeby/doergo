import fs from "fs"
import path from "path"
import { geoFetch } from "../geocode"
import { setAccessToken, __resetAuthSessionForTests } from "../auth-session"

/**
 * Every web call to the gateway's /geo proxy carries the bearer token.
 * /geo/timezone is authenticated (it was refused without one); search / place /
 * reverse are @Public only until the phones send it too.
 */
describe("geoFetch", () => {
  const realFetch = global.fetch
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), text: async () => "{}" }) as any
  })
  afterEach(() => {
    global.fetch = realFetch
    localStorage.clear()
    __resetAuthSessionForTests()
  })

  it("sends the bearer token (from memory) and follows the caller's signal", async () => {
    setAccessToken("tok-1", { broadcast: false })
    const caller = new AbortController()
    await geoFetch("/geo/timezone?lat=1&lon=2", { signal: caller.signal })
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/\/geo\/timezone\?lat=1&lon=2$/)
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-1")
    // The pipeline adds its own timeout signal, wired to the caller's.
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("still calls without a token (signed-out pickers on public routes)", async () => {
    await geoFetch("/geo/search?q=x")
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(new Headers(init.headers).has("Authorization")).toBe(false)
  })
})

describe("no bare fetch to /geo", () => {
  const SRC = path.resolve(__dirname, "../..")
  function* walk(dir: string): Generator<string> {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== "__tests__" && e.name !== "node_modules") yield* walk(full)
      } else if (/\.tsx?$/.test(e.name)) yield full
    }
  }
  it("every /geo/ request goes through geoFetch", () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const code = fs.readFileSync(f, "utf8")
      if (/\bfetch\(\s*`[^`]*\/geo\//.test(code)) offenders.push(path.relative(SRC, f))
    }
    expect(offenders).toEqual([])
  })
})
