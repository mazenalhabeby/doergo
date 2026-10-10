import {
  apiRequest,
  authorizedFetch,
  isRetryableStatus,
  retryAfterMs,
  __setSleepForTests,
  TRANSPORT_MESSAGES,
} from "../http-client"
import { setAccessToken, getAccessToken, __resetAuthSessionForTests } from "../auth-session"
import { isTransientError, apiError } from "../server-error"
import { shouldRetryQuery } from "@/providers/query-provider"

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), json: async () => body }
}

const realFetch = global.fetch
const sleeps: number[] = []

beforeEach(() => {
  sleeps.length = 0
  __setSleepForTests(async (ms) => {
    sleeps.push(ms)
  })
  __resetAuthSessionForTests({ sleep: () => Promise.resolve() })
})
afterEach(() => {
  global.fetch = realFetch
  localStorage.clear()
})

describe("timeouts and cancellation", () => {
  it("a hung request times out as status 0 / TIMEOUT", async () => {
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
    ) as never
    const r = await apiRequest("/slow", { timeoutMs: 20 })
    expect(r).toEqual({ status: 0, error: TRANSPORT_MESSAGES.TIMEOUT, errorCode: "TIMEOUT" })
  })

  it("follows the caller's AbortSignal", async () => {
    const caller = new AbortController()
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
          setTimeout(() => caller.abort(), 5)
        }),
    ) as never
    const r = await apiRequest("/x", { signal: caller.signal })
    expect(r.errorCode).toBe("ABORTED")
    expect(r.status).toBe(0)
  })

  it("a network failure is status 0 with code NETWORK (not a fake 500)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as never
    const r = await apiRequest("/x")
    expect(r.status).toBe(0)
    expect(r.errorCode).toBe("NETWORK")
  })
})

describe("retries", () => {
  it("retries a GET on 429, honouring Retry-After (incl. the limiter's per-window header)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(429, { message: "Too Many Requests" }, { "Retry-After-medium": "2" }))
      .mockResolvedValueOnce(response(200, { ok: 1 })) as never
    const r = await apiRequest<{ ok: number }>("/x")
    expect(r).toEqual({ status: 200, data: { ok: 1 } })
    expect(sleeps).toEqual([2000])
  })

  it("retries a mutation on 429 too — the limiter refused it before anything ran", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(429, {}))
      .mockResolvedValueOnce(response(429, {}))
      .mockResolvedValueOnce(response(200, { done: true })) as never
    const r = await apiRequest("/tasks/1", { method: "PATCH", body: "{}" })
    expect(r.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it("retries GET on 502/503/504 but never a POST", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(503, {})).mockResolvedValueOnce(response(200, {})) as never
    expect((await apiRequest("/x")).status).toBe(200)

    global.fetch = jest.fn().mockResolvedValue(response(503, { message: "down" })) as never
    const post = await apiRequest("/x", { method: "POST", body: "{}" })
    expect(post.status).toBe(503)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("never retries a 4xx", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(400, { message: "bad" })) as never
    await apiRequest("/x")
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("gives up after the retry budget", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(429, { message: "Too Many Requests" })) as never
    const r = await apiRequest("/x")
    expect(r.status).toBe(429)
    expect(global.fetch).toHaveBeenCalledTimes(5) // 1 + 4 retries
  })

  it("rule table", () => {
    expect(isRetryableStatus(429, "POST")).toBe(true)
    expect(isRetryableStatus(503, "GET")).toBe(true)
    expect(isRetryableStatus(503, "DELETE")).toBe(false)
    expect(isRetryableStatus(500, "GET")).toBe(false)
    expect(isRetryableStatus(404, "GET")).toBe(false)
    expect(retryAfterMs(new Headers({ "Retry-After": "3", "Retry-After-short": "1" }))).toBe(3000)
    expect(retryAfterMs(new Headers())).toBeNull()
    expect(retryAfterMs(new Headers({ "Retry-After": "600" }))).toBe(20000) // capped
  })
})

describe("refusals and the session", () => {
  it("keeps a refusal's code and params", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(400, { message: "Too far", code: "TOO_FAR_TO_START", params: { distanceMetres: 900 } })) as never
    const r = await apiRequest("/x")
    expect(r).toEqual({ status: 400, error: "Too far", errorCode: "TOO_FAR_TO_START", errorParams: { distanceMetres: 900 } })
  })

  it("on 401 refreshes once and repeats the request with the new token", async () => {
    setAccessToken("old", { broadcast: false })
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(401, {}))
      .mockResolvedValueOnce(response(200, { success: true, data: { accessToken: "new" } })) // /auth/refresh
      .mockResolvedValueOnce(response(200, { ok: true })) as never
    const r = await apiRequest("/x")
    expect(r.status).toBe(200)
    const third = (global.fetch as jest.Mock).mock.calls[2][1]
    expect(new Headers(third.headers).get("Authorization")).toBe("Bearer new")
  })

  it("a 401 whose refresh fails transiently does NOT sign anybody out", async () => {
    setAccessToken("tok", { broadcast: false })
    global.fetch = jest.fn((url: string) =>
      Promise.resolve(String(url).endsWith("/auth/refresh") ? response(503, null) : response(401, {})),
    ) as never
    const r = await apiRequest("/x")
    expect(r.status).toBe(0)
    expect(r.errorCode).toBe("NETWORK")
    expect(getAccessToken()).toBe("tok")
  })

  it("auth:false sends no bearer token and does not refresh", async () => {
    setAccessToken("tok", { broadcast: false })
    global.fetch = jest.fn().mockResolvedValue(response(401, {})) as never
    await authorizedFetch("/api/v1/support/agent/inbox", { auth: false })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(new Headers(init.headers).has("Authorization")).toBe(false)
  })

  it("a FormData body keeps its own content type", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, {})) as never
    const form = new FormData()
    form.append("file", "x")
    await apiRequest("/users/avatar/upload", { method: "POST", body: form })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(new Headers(init.headers).has("Content-Type")).toBe(false)
  })
})

describe("QueryClient retry policy", () => {
  it("retries only network / 5xx / 429, once", () => {
    expect(shouldRetryQuery(0, apiError({ error: "x", status: 503 }))).toBe(true)
    expect(shouldRetryQuery(0, apiError({ error: "x", status: 429 }))).toBe(true)
    expect(shouldRetryQuery(0, new Error(TRANSPORT_MESSAGES.NETWORK))).toBe(true)
    expect(shouldRetryQuery(1, apiError({ error: "x", status: 503 }))).toBe(false)
    expect(shouldRetryQuery(0, apiError({ error: "x", status: 403 }))).toBe(false)
    expect(shouldRetryQuery(0, apiError({ error: "x", status: 404 }))).toBe(false)
    expect(shouldRetryQuery(0, new Error("Forbidden"))).toBe(false)
    expect(isTransientError(null)).toBe(false)
  })
})
