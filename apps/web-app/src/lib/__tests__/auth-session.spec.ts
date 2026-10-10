/**
 * The session lives in memory, is shared between tabs, and ends only when the
 * gateway REFUSES a refresh — never because the gateway was briefly away.
 */

type Session = typeof import("../auth-session")

/** A BroadcastChannel bus shared by every "tab" (module copy) in one test. */
function installFakeBroadcastChannel() {
  const members = new Set<FakeChannel>()
  class FakeChannel {
    onmessage: ((ev: MessageEvent) => void) | null = null
    constructor(public name: string) {
      members.add(this)
    }
    postMessage(data: unknown) {
      for (const m of members) {
        if (m !== this && m.name === this.name) m.onmessage?.({ data } as MessageEvent)
      }
    }
    close() {
      members.delete(this)
    }
  }
  ;(globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = FakeChannel
  return () => {
    delete (globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel
  }
}

/** A fresh copy of the module = one browser tab. */
function openTab(): Session {
  let mod!: Session
  jest.isolateModules(() => {
    mod = require("../auth-session")
  })
  mod.__resetAuthSessionForTests({ sleep: () => Promise.resolve() })
  return mod
}

/** An unsigned JWT-shaped token for user `sub`, valid for an hour. */
function jwt(sub: string, expInSeconds = 3600): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
  return `${b64({ alg: "none" })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + expInSeconds })}.sig`
}

function response(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers(), json: async () => body }
}

const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
  localStorage.clear()
})

describe("token store", () => {
  let restore: () => void
  beforeEach(() => {
    restore = installFakeBroadcastChannel()
  })
  afterEach(() => restore())

  it("keeps the access token in memory only — never in localStorage", () => {
    const tab = openTab()
    const token = jwt("u1")
    tab.setAccessToken(token)
    expect(tab.getAccessToken()).toBe(token)
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toContain(token)
    }
    // Only a non-secret hint that a session may exist.
    expect(localStorage.getItem(tab.SESSION_HINT_KEY)).toBe("1")
  })

  it("removes the token an earlier version kept on disk", () => {
    localStorage.setItem("hbcfield_access_token", "old-token")
    const tab = openTab()
    tab.getAccessToken()
    expect(localStorage.getItem("hbcfield_access_token")).toBeNull()
  })

  it("shares a new token with the other tabs over the channel", () => {
    const a = openTab()
    const b = openTab()
    b.getAccessToken() // opens b's channel
    const token = jwt("u1")
    a.setAccessToken(token)
    expect(b.getAccessToken()).toBe(token)
  })

  it("signing out in one tab ends the session in the others", () => {
    const a = openTab()
    const b = openTab()
    const token = jwt("u1")
    b.setAccessToken(token, { broadcast: false })
    const events: string[] = []
    b.onSessionEvent((e) => events.push(e.type === "ended" ? `ended:${e.reason}` : e.type))
    a.clearSession()
    expect(b.getAccessToken()).toBeNull()
    expect(events).toEqual(["ended:signed-out"])
  })

  it("somebody else signing in tells the other tabs their identity changed", () => {
    const a = openTab()
    const b = openTab()
    b.setAccessToken(jwt("alice"), { broadcast: false })
    const events: string[] = []
    b.onSessionEvent((e) => events.push(e.type))
    a.setAccessToken(jwt("bob"))
    expect(events[0]).toBe("identity-changed")
  })

  it("a tab that just loaded takes the token another tab already has", async () => {
    const a = openTab()
    const b = openTab()
    const token = jwt("u1")
    a.setAccessToken(token)
    b.__resetAuthSessionForTests({ sleep: () => Promise.resolve() }) // b reloaded: empty memory
    global.fetch = jest.fn() as never
    expect(await b.restoreSession()).toBe("ok")
    expect(b.getAccessToken()).toBe(token)
    expect(global.fetch).not.toHaveBeenCalled() // no cookie rotation needed
  })
})

describe("storage-event fallback (no BroadcastChannel)", () => {
  it("carries sign-out but never the token", () => {
    const tab = openTab()
    tab.setAccessToken(jwt("u1"), { broadcast: false })
    const setItem = jest.spyOn(Storage.prototype, "setItem")
    const events: string[] = []
    tab.onSessionEvent((e) => events.push(e.type))
    tab.setAccessToken(jwt("u1"))
    for (const [, value] of setItem.mock.calls) expect(String(value)).not.toContain(".sig")
    // Another tab signing out arrives as a storage event.
    window.dispatchEvent(
      new StorageEvent("storage", { key: "hbc-auth-event", newValue: JSON.stringify({ type: "signed-out", from: "other" }) }),
    )
    expect(tab.getAccessToken()).toBeNull()
    expect(events).toContain("ended")
    setItem.mockRestore()
  })
})

describe("refresh", () => {
  it("401 ends the session and says so", async () => {
    const tab = openTab()
    tab.setAccessToken(jwt("u1"), { broadcast: false })
    const events: Array<{ type: string; reason?: string }> = []
    tab.onSessionEvent((e) => events.push(e as never))
    global.fetch = jest.fn().mockResolvedValue(response(401, { message: "Invalid refresh token" })) as never
    expect(await tab.refreshAccessToken()).toBe("ended")
    expect(tab.getAccessToken()).toBeNull()
    expect(events).toEqual([expect.objectContaining({ type: "ended", reason: "expired" })])
  })

  it("403 for a switched-off organization ends it as suspended", async () => {
    const tab = openTab()
    tab.setAccessToken(jwt("u1"), { broadcast: false })
    const events: Array<{ type: string; reason?: string }> = []
    tab.onSessionEvent((e) => events.push(e as never))
    global.fetch = jest
      .fn()
      .mockResolvedValue(response(403, { message: "This organization is currently deactivated. Please contact HBCField support." })) as never
    expect(await tab.refreshAccessToken()).toBe("ended")
    expect(events[0]).toEqual(expect.objectContaining({ type: "ended", reason: "suspended" }))
  })

  it("5xx keeps the session (retried, then reported unavailable)", async () => {
    const tab = openTab()
    const token = jwt("u1")
    tab.setAccessToken(token, { broadcast: false })
    const events: unknown[] = []
    tab.onSessionEvent((e) => events.push(e))
    global.fetch = jest.fn().mockResolvedValue(response(502, null)) as never
    expect(await tab.refreshAccessToken()).toBe("unavailable")
    expect(tab.getAccessToken()).toBe(token)
    expect(events).toEqual([])
    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(1) // retried with backoff
  })

  it("a network failure keeps the session too", async () => {
    const tab = openTab()
    const token = jwt("u1")
    tab.setAccessToken(token, { broadcast: false })
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as never
    expect(await tab.refreshAccessToken()).toBe("unavailable")
    expect(tab.getAccessToken()).toBe(token)
  })

  it("a success stores the new token; concurrent callers share one request", async () => {
    const tab = openTab()
    const fresh = jwt("u1")
    global.fetch = jest.fn().mockResolvedValue(response(200, { success: true, data: { accessToken: fresh } })) as never
    const [x, y] = await Promise.all([tab.refreshAccessToken(), tab.refreshAccessToken()])
    expect([x, y]).toEqual(["ok", "ok"])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(tab.getAccessToken()).toBe(fresh)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(init.credentials).toBe("include") // the httpOnly cookie
  })

  it("on a fresh anonymous visit (no hint) boot makes no request and announces nothing", async () => {
    const tab = openTab()
    global.fetch = jest.fn() as never
    const events: unknown[] = []
    tab.onSessionEvent((e) => events.push(e))
    expect(await tab.restoreSession()).toBe("ended")
    expect(global.fetch).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it("boot with a hint but a dead cookie is quiet (no redirect for a session that was never open here)", async () => {
    localStorage.setItem("hbc-auth-session", "1")
    const tab = openTab()
    global.fetch = jest.fn().mockResolvedValue(response(401, {})) as never
    const events: unknown[] = []
    tab.onSessionEvent((e) => events.push(e))
    expect(await tab.restoreSession()).toBe("ended")
    expect(events).toEqual([])
    expect(tab.hasSessionHint()).toBe(false)
  })
})
