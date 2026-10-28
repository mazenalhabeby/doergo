/**
 * The web's plug-in of the shared request pipeline (lib/http-client.ts).
 *
 * The pipeline's own behaviour is the shared core's and is tested there
 * (shared-http-core.spec.ts); what is pinned here is what the WEB plugs in —
 * and that, plugged in, the browser still gets what the hand-written client
 * gave it: the in-memory token, one refresh through auth-session, four
 * retries for "not now", no sign-out on a gateway restart, the refusal's code.
 */
import { createApiClient, apiEndpoints, isApiError } from "@hbcfield/shared/client"
import {
  asResult,
  authClientConfig,
  call,
  toRefreshResult,
  webClientConfig,
  TRANSPORT_MESSAGES,
  type ApiResponse,
} from "../http-client"
import { setAccessToken, getAccessToken, __resetAuthSessionForTests } from "../auth-session"
import { isTransientError, apiError } from "../server-error"
import { API_BASE_URL } from "../endpoints"
import { shouldRetryQuery } from "@/providers/query-provider"

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: async () => (body === undefined || body === null ? "" : JSON.stringify(body)),
    json: async () => body,
  }
}

const realFetch = global.fetch
const sleeps: number[] = []

/** The web's client exactly as configured, with waits made instant. */
function webClient() {
  return createApiClient({
    ...webClientConfig(),
    sleep: async (ms: number) => {
      sleeps.push(ms)
    },
  })
}

const raw = <T,>(p: Promise<T>) => asResult(p)

beforeEach(() => {
  sleeps.length = 0
  __resetAuthSessionForTests({ sleep: () => Promise.resolve() })
})
afterEach(() => {
  global.fetch = realFetch
  localStorage.clear()
})

describe("what the web plugs in", () => {
  it("the base URL, the cookie, the platform header and four retries", () => {
    const cfg = webClientConfig()
    expect(cfg.baseUrl()).toBe(API_BASE_URL)
    expect(cfg.credentials).toBe("include")
    expect(cfg.headers?.()).toEqual({ "X-Client-Platform": "web" })
    expect(cfg.retry).toEqual({ maxRetries: 4 })
    expect(cfg.timeoutMs).toBe(30_000)
    expect(typeof cfg.refresh).toBe("function")
  })

  it("sign-in calls carry no token, refresh nothing and never retry", () => {
    const cfg = authClientConfig()
    expect(cfg.getToken).toBeUndefined()
    expect(cfg.refresh).toBeUndefined()
    expect(cfg.retry).toEqual({ maxRetries: 0, networkRetries: 0 })
    expect(cfg.credentials).toBe("include")
  })

  it("auth-session's refresh answer, in the core's words — only `ended` ends the session", () => {
    expect(toRefreshResult("ok")).toBe("refreshed")
    expect(toRefreshResult("ended")).toBe("invalid")
    expect(toRefreshResult("unavailable")).toBe("unreachable")
  })

  it("sends the in-memory token, the platform header and the cookie", async () => {
    setAccessToken("tok-1", { broadcast: false })
    global.fetch = jest.fn().mockResolvedValue(response(200, { success: true, data: 1 })) as never
    await webClient().get("/x")
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/x`)
    expect(init.headers.Authorization).toBe("Bearer tok-1")
    expect(init.headers["X-Client-Platform"]).toBe("web")
    expect(init.credentials).toBe("include")
  })
})

describe("timeouts and cancellation", () => {
  it("a hung request times out as status 0 / TIMEOUT", async () => {
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
    ) as never
    const r = await raw(webClient().get("/slow", { timeoutMs: 20 }))
    expect(r).toMatchObject({ status: 0, error: TRANSPORT_MESSAGES.TIMEOUT, errorCode: "TIMEOUT" })
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
    const r = await raw(webClient().get("/x", { signal: caller.signal }))
    expect(r.errorCode).toBe("ABORTED")
    expect(r.status).toBe(0)
  })

  it("a network failure is status 0 with code NETWORK (not a fake 500)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as never
    const r = await raw(webClient().get("/x"))
    expect(r.status).toBe(0)
    expect(r.errorCode).toBe("NETWORK")
    expect(r.error).toBe(TRANSPORT_MESSAGES.NETWORK)
  })
})

describe("retries", () => {
  it("retries a GET on 429, honouring Retry-After (incl. the limiter's per-window header)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(429, { message: "Too Many Requests" }, { "Retry-After-medium": "2" }))
      .mockResolvedValueOnce(response(200, { ok: 1 })) as never
    const r = await raw(webClient().get("/x", { unwrap: "raw" }))
    expect(r).toEqual({ status: 200, data: { ok: 1 } })
    expect(sleeps).toEqual([2000])
  })

  it("retries a mutation on 429 too — the limiter refused it before anything ran", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(429, {}))
      .mockResolvedValueOnce(response(429, {}))
      .mockResolvedValueOnce(response(200, { done: true })) as never
    const r = await raw(webClient().patch("/tasks/1", {}))
    expect(r.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it("retries GET on 502/503/504, and a POST only under its one Idempotency-Key", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(503, {})).mockResolvedValueOnce(response(200, {})) as never
    expect((await raw(webClient().get("/x"))).status).toBe(200)

    global.fetch = jest.fn().mockResolvedValue(response(503, { message: "down" })) as never
    const post = await raw(webClient().post("/x", {}))
    expect(post.status).toBe(503)
    const keys = (global.fetch as jest.Mock).mock.calls.map(([, init]) => init.headers["Idempotency-Key"])
    expect(keys.length).toBeGreaterThan(1)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it("never retries a 4xx", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(400, { message: "bad" })) as never
    await raw(webClient().get("/x"))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("gives up after the web's budget of four", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(429, { message: "Too Many Requests" })) as never
    const r = await raw(webClient().get("/x"))
    expect(r.status).toBe(429)
    expect(global.fetch).toHaveBeenCalledTimes(5) // 1 + 4 retries
  })
})

describe("refusals and the session", () => {
  it("keeps a refusal's code and params — and the ApiError itself", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(400, { message: "Too far", code: "TOO_FAR_TO_START", params: { distanceMetres: 900 } })) as never
    const r = await raw(webClient().get("/x"))
    expect(r).toMatchObject({ status: 400, error: "Too far", errorCode: "TOO_FAR_TO_START", errorParams: { distanceMetres: 900 } })
    expect(isApiError(r.cause)).toBe(true)
    const thrown = apiError(r)
    expect(thrown.code).toBe("TOO_FAR_TO_START")
    expect(thrown.params).toEqual({ distanceMetres: 900 })
    expect(thrown.status).toBe(400)
  })

  it("on 401 refreshes once (through auth-session) and repeats the request with the new token", async () => {
    setAccessToken("old", { broadcast: false })
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(401, {}))
      .mockResolvedValueOnce(response(200, { success: true, data: { accessToken: "new" } })) // /auth/refresh
      .mockResolvedValueOnce(response(200, { ok: true })) as never
    const r = await raw(webClient().get("/x"))
    expect(r.status).toBe(200)
    expect(String((global.fetch as jest.Mock).mock.calls[1][0])).toMatch(/\/auth\/refresh$/)
    const third = (global.fetch as jest.Mock).mock.calls[2][1]
    expect(third.headers.Authorization).toBe("Bearer new")
    expect(getAccessToken()).toBe("new")
  })

  it("a 401 whose refresh fails transiently does NOT sign anybody out", async () => {
    setAccessToken("tok", { broadcast: false })
    global.fetch = jest.fn((url: string) =>
      Promise.resolve(String(url).endsWith("/auth/refresh") ? response(503, null) : response(401, {})),
    ) as never
    const r = await raw(webClient().get("/x"))
    expect(r.status).toBe(0)
    expect(r.errorCode).toBe("SESSION_UNREACHABLE")
    expect(isTransientError(apiError(r))).toBe(true)
    expect(getAccessToken()).toBe("tok")
  })

  it("a refused refresh ends the session in auth-session (which tells the other tabs)", async () => {
    setAccessToken("tok", { broadcast: false })
    localStorage.setItem("hbc-auth-session", "1")
    global.fetch = jest.fn((url: string) =>
      Promise.resolve(String(url).endsWith("/auth/refresh") ? response(401, { message: "expired" }) : response(401, {})),
    ) as never
    const r = await raw(webClient().get("/x"))
    expect(r.status).toBe(401)
    expect(getAccessToken()).toBeNull()
  })

  it("auth:false sends no bearer token and does not refresh", async () => {
    setAccessToken("tok", { broadcast: false })
    global.fetch = jest.fn().mockResolvedValue(response(401, {})) as never
    await raw(webClient().get("/invitations/validate/ABC", { auth: false }))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it("a FormData body keeps its own content type", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, {})) as never
    const form = new FormData()
    form.append("file", "x")
    await raw(webClient().upload("/users/avatar/upload", form))
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(init.headers["Content-Type"]).toBeUndefined()
    expect(init.body).toBe(form)
  })
})

describe("call(): an endpoint from the table, answered raw", () => {
  it("encodes every path value and returns the body as the server sent it", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, { success: true, data: { id: "a/b" } })) as never
    const r = (await call(apiEndpoints.tasks.get, { id: "a/b?c#d" })) as ApiResponse<{ success: boolean; data: { id: string } }>
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/tasks/a%2Fb%3Fc%23d`)
    expect(init.method).toBe("GET")
    expect(r.data).toEqual({ success: true, data: { id: "a/b" } })
  })

  it("sends the body as JSON and the query encoded", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, { success: true })) as never
    await call(apiEndpoints.tasks.assign, { id: "t1" }, { body: { workerId: "u1" }, query: { a: "x y", b: undefined } })
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/tasks/t1/assign?a=x+y`)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual({ workerId: "u1" })
    expect(init.headers["Content-Type"]).toBe("application/json")
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
