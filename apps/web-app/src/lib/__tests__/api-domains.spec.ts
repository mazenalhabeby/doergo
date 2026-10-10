/**
 * A few lib/api methods end to end against a mocked network: the path is built
 * from the endpoint table with every value encoded, the body and query go where
 * the gateway reads them, and a refusal rejects with its CODE and PARAMS — the
 * thing `throw new Error(response.error)` used to drop.
 */
import { isApiError } from "@hbcfield/shared/client"
import { tasksApi, attendanceApi, legalEntitiesApi, sprintsApi, calendarApi } from "@/lib/api"
import { __resetAuthSessionForTests } from "../auth-session"
import { API_BASE_URL } from "../endpoints"

function response(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers(), text: async () => JSON.stringify(body) }
}

const realFetch = global.fetch
let calls: Array<{ url: string; init: RequestInit & { headers: Record<string, string> } }>

function answer(status: number, body: unknown) {
  calls = []
  global.fetch = jest.fn(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
    calls.push({ url, init })
    return response(status, body)
  }) as never
}

beforeEach(() => __resetAuthSessionForTests({ sleep: () => Promise.resolve() }))
afterEach(() => {
  global.fetch = realFetch
})

describe("paths are encoded", () => {
  it("an id with a slash, a query and a fragment stays ONE segment", async () => {
    answer(200, { success: true, data: { id: "x" } })
    await tasksApi.getById("../users/me?x=1#y")
    expect(calls[0].url).toBe(`${API_BASE_URL}/tasks/..%2Fusers%2Fme%3Fx%3D1%23y`)
  })

  it("two route values, each encoded", async () => {
    answer(200, { success: true, data: {} })
    await tasksApi.crewForMember("t/1", "join", { forUserId: "u1", reason: "covering" })
    expect(calls[0].url).toBe(`${API_BASE_URL}/tasks/t%2F1/crew/join`)
    expect(calls[0].init.method).toBe("POST")
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ forUserId: "u1", reason: "covering" })
  })

  it("query values are encoded and empty ones dropped", async () => {
    answer(200, { success: true, data: [] })
    await sprintsApi.list("ACTIVE&x=1")
    expect(calls[0].url).toBe(`${API_BASE_URL}/sprints?status=ACTIVE%26x%3D1`)
    await sprintsApi.list("")
    expect(calls[1].url).toBe(`${API_BASE_URL}/sprints`)
  })

  it("an endpoint whose action is a choice of two routes", async () => {
    answer(200, { success: true, data: { id: "e1" } })
    await legalEntitiesApi.setActive("e1", false)
    expect(calls[0].url).toBe(`${API_BASE_URL}/legal-entities/e1/deactivate`)
    await legalEntitiesApi.setActive("e1", true)
    expect(calls[1].url).toBe(`${API_BASE_URL}/legal-entities/e1/reactivate`)
  })

  it("a list of ids travels as one comma-separated value", async () => {
    answer(200, { success: true, data: [] })
    await attendanceApi.getEntriesBatch(["a", "b/c"], "2026-10-10")
    expect(calls[0].url).toBe(`${API_BASE_URL}/attendance/entries?ids=a%2Cb%2Fc&date=2026-10-10`)
  })
})

describe("a refusal keeps its code", () => {
  it("taking a role task somebody else took rejects with ROLE_TASK_TAKEN and who took it", async () => {
    answer(409, { statusCode: 409, message: "Somebody was faster", code: "ROLE_TASK_TAKEN", params: { takers: ["Mike"] } })
    const err = await tasksApi.take("t1").catch((e: unknown) => e)
    expect(isApiError(err)).toBe(true)
    expect(err).toMatchObject({ status: 409, code: "ROLE_TASK_TAKEN", params: { takers: ["Mike"] } })
  })

  it("a calendar refusal too (calendarCall)", async () => {
    answer(400, { statusCode: 400, message: "Too long", code: "EVENT_TOO_LONG" })
    const err = await calendarApi.event("e1").catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 400, code: "EVENT_TOO_LONG" })
  })

  it("a method that only threw a sentence before now throws the ApiError", async () => {
    answer(403, { statusCode: 403, message: "No access", code: "SPACE_NOT_YOURS" })
    const err = await attendanceApi.getMyStatus().catch((e: unknown) => e)
    expect(isApiError(err)).toBe(true)
    expect(err).toMatchObject({ status: 403, code: "SPACE_NOT_YOURS" })
  })
})
