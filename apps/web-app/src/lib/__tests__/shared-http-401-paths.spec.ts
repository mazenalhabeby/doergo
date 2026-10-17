/**
 * The 401 paths of the shared HTTP core not pinned in shared-http-core.spec:
 * a token already replaced by another request, and a second 401 after the one
 * refresh (it goes through the ordinary rules, never a second refresh).
 */
import { createApiClient, TRANSPORT_CODES, type ResponseLike } from "@hbcfield/shared/client"

function res(status: number, body?: unknown): ResponseLike {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null, forEach: () => undefined },
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  }
}

describe("shared HTTP core — 401 paths", () => {
  it("asks again WITHOUT refreshing when another request already replaced the token", async () => {
    let token = "old"
    const sent: string[] = []
    const refresh = jest.fn(async () => "refreshed" as const)
    const fetch = jest.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      sent.push(init.headers.Authorization)
      if (sent.length === 1) {
        token = "new" // another request refreshed while this one was in flight
        return res(401, { message: "expired" })
      }
      return res(200, { data: "ok" })
    })
    const client = createApiClient({
      baseUrl: () => "http://x",
      fetch,
      getToken: () => token,
      refresh,
      retry: { maxRetries: 0, networkRetries: 0 },
    })
    await expect(client.get("/a")).resolves.toBe("ok")
    expect(refresh).not.toHaveBeenCalled()
    expect(sent).toEqual(["Bearer old", "Bearer new"])
  })

  it("refreshes once; a second 401 is an ordinary error and ends nothing", async () => {
    let n = 0
    const refresh = jest.fn(async () => "refreshed" as const)
    const onSessionEnded = jest.fn()
    const fetch = jest.fn(async () => res(401, { message: `no ${++n}` }))
    const client = createApiClient({
      baseUrl: () => "http://x",
      fetch,
      getToken: () => "t",
      refresh,
      onSessionEnded,
      retry: { maxRetries: 0, networkRetries: 0 },
    })
    await expect(client.get("/a")).rejects.toMatchObject({ status: 401, message: "no 2" })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it("an unreachable refresh keeps the session and fails like no signal", async () => {
    const onSessionEnded = jest.fn()
    const client = createApiClient({
      baseUrl: () => "http://x",
      fetch: async () => res(401, {}),
      getToken: () => "t",
      refresh: async () => "unreachable" as const,
      onSessionEnded,
      retry: { maxRetries: 0, networkRetries: 0 },
    })
    await expect(client.get("/a")).rejects.toMatchObject({
      status: 0,
      kind: "network",
      code: TRANSPORT_CODES.sessionUnreachable,
    })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })
})
