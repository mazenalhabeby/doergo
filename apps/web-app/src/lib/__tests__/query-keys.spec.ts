import fs from "fs"
import path from "path"
import { QueryClient } from "@tanstack/react-query"
import { apiEndpoints, queryKey } from "@hbcfield/shared/client"
import { keys, membersPageParams, MEMBER_DIRECTORY_PAGE_SIZE } from "../query-keys"

/**
 * Query keys are derived from the endpoint table: `[domain, endpoint, args]`.
 * What matters is what an invalidation REACHES — so most of this asks a real
 * QueryClient which cached entries a prefix invalidates.
 */

function cacheWith(...entries: ReadonlyArray<readonly unknown[]>) {
  const qc = new QueryClient()
  for (const k of entries) qc.setQueryData(k, { k })
  return qc
}

function reached(qc: QueryClient, prefix: readonly unknown[]) {
  return qc
    .getQueryCache()
    .findAll({ queryKey: prefix })
    .map((q) => JSON.stringify(q.queryKey))
    .sort()
}

describe("keys are derived, never typed", () => {
  it("names the endpoint the query reads, then its arguments", () => {
    expect(keys.tasks.detail("t1")).toEqual(["tasks", "get", { id: "t1" }])
    expect(keys.tasks.detail("t1")).toEqual(queryKey(apiEndpoints.tasks.get, { id: "t1" }))
    expect(keys.locations.roster("s1")).toEqual(["locations", "members", { id: "s1" }])
    expect(keys.customers.detail("c1")).toEqual(["customers", "get", { id: "c1" }])
  })

  it("is deterministic: argument order does not matter, undefined is dropped", () => {
    expect(keys.tasks.list({ page: 1, spaceId: "s", search: undefined })).toEqual(keys.tasks.list({ spaceId: "s", page: 1 }))
  })

  it("two different requests can no longer share a key", () => {
    // `["locations"]` held GET /locations on one page and ?includeInactive=true on another.
    expect(keys.locations.list()).not.toEqual(keys.locations.list({ includeInactive: true }))
    expect(keys.locations.list({ limit: 100 })).not.toEqual(keys.locations.list())
    // The dashboard's task list and the menu's hover prefetch were the same string for different requests.
    expect(keys.tasks.list({ limit: 200 })).not.toEqual(keys.tasks.list())
  })

  it("the members page and its hover prefetch ask the same thing", () => {
    const page = keys.members.list(membersPageParams("", "all", 1))
    const prefetch = keys.members.list(membersPageParams("", "all", 1))
    expect(page).toEqual(prefetch)
    expect(membersPageParams("", "all", 1)).toEqual({ search: undefined, role: "all", page: 1, limit: 20 })
  })

  it("the member directory is ONE key (every page, the server's cap) — full and lite", () => {
    expect(MEMBER_DIRECTORY_PAGE_SIZE).toBe(200)
    expect(keys.members.directory()).toEqual(["organizations", "members", { all: true, limit: 200 }])
    expect(keys.members.directoryLite()).toEqual(["organizations", "members", { all: true, limit: 200, lite: true }])
  })

  it("a roster batch is the same key whatever order the screen listed its spaces", () => {
    expect(keys.locations.rosterBatch(["a", "b"])).toEqual(keys.locations.rosterBatch(["a", "b"]))
    expect(keys.locations.rosterBatch(["a", "b"])).toEqual(["locations", "rosters", { ids: ["a", "b"] }])
  })
})

describe("every name is an endpoint in the table", () => {
  it("query-keys.ts names only endpoints that exist", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/query-keys.ts"), "utf8")
    const names = [...src.matchAll(/queryKey\("([a-zA-Z]+\.[a-zA-Z]+)"/g)].map((m) => m[1]!)
    expect(names.length).toBeGreaterThan(30)
    const missing = names.filter((n) => {
      const [d, k] = n.split(".") as [string, string]
      return !(apiEndpoints as unknown as Record<string, Record<string, { name: string }>>)[d]?.[k]
    })
    expect(missing).toEqual([])
  })
})

describe("what an invalidation reaches", () => {
  const entries = [
    keys.tasks.list(),
    keys.tasks.list({ spaceId: "s1", page: 2 }),
    keys.tasks.counts(),
    keys.tasks.counts({ groupBy: "space" }),
    keys.tasks.detail("t1"),
    keys.tasks.timeline("t1"),
    keys.tasks.time("t1"),
  ]

  it("tasks.lists() reaches every list and nothing else — a list-shaped setQueriesData cannot hit a detail", () => {
    expect(reached(cacheWith(...entries), keys.tasks.lists())).toEqual(
      [keys.tasks.list(), keys.tasks.list({ spaceId: "s1", page: 2 })].map((k) => JSON.stringify(k)).sort(),
    )
  })

  it("tasks.counts() reaches both the status and the workspace counts", () => {
    expect(reached(cacheWith(...entries), keys.tasks.counts())).toHaveLength(2)
  })

  it("tasks.details() reaches every open task, tasks.detail(id) only that one", () => {
    const qc = cacheWith(...entries, keys.tasks.detail("t2"))
    expect(reached(qc, keys.tasks.details())).toHaveLength(2)
    expect(reached(qc, keys.tasks.detail("t1"))).toEqual([JSON.stringify(keys.tasks.detail("t1"))])
  })

  it("members.lists() reaches the page, the pickers and the directory — not a member's record", () => {
    const qc = cacheWith(
      keys.members.list(membersPageParams("", "all", 1)),
      keys.members.list({ limit: 200, managersOnly: true, excludeId: "u1" }),
      keys.members.directory(),
      keys.members.directoryLite(),
      keys.members.detail("u1"),
    )
    expect(reached(qc, keys.members.lists())).toHaveLength(4)
    expect(reached(qc, keys.members.details())).toHaveLength(1)
  })

  it("access roles: invalidating all reaches the space-scoped read too", () => {
    const qc = cacheWith(keys.organization.roles(), keys.organization.roles("space"))
    expect(reached(qc, keys.organization.roleLists())).toHaveLength(2)
    expect(keys.organization.roles("org")).toEqual(keys.organization.roles())
  })
})

describe("the migrated families stay migrated", () => {
  const SRC = path.join(process.cwd(), "src")
  function* walk(dir: string): Generator<string> {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== "__tests__" && e.name !== "node_modules") yield* walk(full)
      } else if (/\.tsx?$/.test(e.name)) yield full
    }
  }
  /** Hand-typed first segments these families used to be cached under. */
  const RETIRED = [
    "tasks", "task", "taskStatusCounts", "taskTimeline", "task-time", "taskReport", "task-submissions", "taskAttachments", "task-route",
    "orgMembers", "orgMember", "members-for-audit", "org-people-for-routing", "phoneSyncPeople",
    "locations", "location", "locations-all", "location-assignments", "all-location-assignments", "locationRosters", "space-roster", "triageSpaces",
    "space-members", "triageSpaceMembers",
    "customers", "customer", "customersAll", "space-customers", "space-clients", "space-app-residents", "crm-has-companies", "contact-search",
    "sprints", "epics", "phases", "recurringTasks", "customFieldDefinitions", "workflows", "triageFlows", "invoice",
    "organization-profile", "orgAccessRoles", "org-roles", "access-roles",
  ]

  it("no screen keys them by hand again", () => {
    const offenders: string[] = []
    const re = new RegExp(`\\[\\s*["'](${RETIRED.map((r) => r.replace(/-/g, "\\-")).join("|")})["']\\s*[,\\]]`, "g")
    for (const f of walk(SRC)) {
      const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
      for (const m of src.matchAll(re)) {
        // Only where a key is expected: queryKey, set/get/invalidate/cancel/refetch, or a key list.
        const before = src.slice(Math.max(0, m.index! - 40), m.index!)
        // A label pair (`["task", t("…")]`) in an option list is not a key.
        if (/^\s*t\(/.test(src.slice(m.index! + m[0].length))) continue
        if (/queryKey:\s*$|QueryData(<[^>]*>)?\(\s*$|\[\s*$|,\s*$/.test(before)) offenders.push(`${path.relative(SRC, f)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
