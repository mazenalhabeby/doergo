import fs from "fs"
import path from "path"
import { QueryClient } from "@tanstack/react-query"
import { apiEndpoints, queryKey } from "@hbcfield/shared/client"
import { invalidateTimeOff, keys, membersPageParams, MEMBER_DIRECTORY_PAGE_SIZE } from "../query-keys"

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
    // query-keys.ts and its area files (query-keys/, split 2026-10-17).
    const dir = path.join(process.cwd(), "src/lib/query-keys")
    const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
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

describe("the hand-named families keep the values the screens cached under", () => {
  // These families predate the endpoint table. A changed VALUE would orphan
  // every cached entry and, worse, every prefix invalidation still written
  // against the old one — so the values are pinned, not just the names.
  it("a reader and its prefix", () => {
    expect(keys.attendance.list("loc", "ALL", "2026-10-01")).toEqual(["attendance", "loc", "ALL", "2026-10-01"])
    expect(keys.attendance.list()).toEqual(["attendance"])
    expect(keys.attendance.entryPresence("e1")).toEqual(["attendance", "entry-presence", "e1"])
    expect(keys.timeOff.orgWindow("a", "b")).toEqual(["orgTimeOff", "window", "a", "b"])
    expect(keys.rates.history("SPACE", "s1")).toEqual(["rate-history", "SPACE", "s1"])
    expect(keys.chat.thread("c1")).toEqual(["chat", "thread", "c1"])
    expect(keys.support.ticket("t1")).toEqual(["support", "ticket", "t1"])
    expect(keys.companies.includingInactive()).toEqual(["legal-entities", "all"])
  })

  it("an optional trailing part passed as undefined stays in the key, as it always did", () => {
    // `["my-leave-balance", user?.id]` before the user loads — a different entry
    // from the prefix, exactly as when it was typed inline.
    expect(keys.timeOff.myBalance(undefined)).toEqual(["my-leave-balance", undefined])
    expect(keys.timeOff.myBalance()).toEqual(["my-leave-balance"])
  })

  it("`invoices.all()` still reaches the endpoint-derived invoice keys", () => {
    const qc = cacheWith(keys.invoices.detail("i1"), keys.invoices.list("ALL", "", undefined), keys.invoices.gather({ spaceId: "s" }))
    expect(reached(qc, keys.invoices.all())).toHaveLength(2)
  })

  it("the time-off helper reaches every screen that renders leave", () => {
    const qc = cacheWith(
      keys.timeOff.member("m1", "PENDING"),
      keys.timeOff.orgApproved(),
      keys.timeOff.orgWindow("a", "b"),
      keys.timeOff.coverRange("a", "b"),
      keys.timeOff.mine("u1"),
    )
    const invalidated: string[] = []
    const spy = jest.spyOn(qc, "invalidateQueries").mockImplementation((f) => {
      invalidated.push(...reached(qc, (f as { queryKey: readonly unknown[] }).queryKey))
      return Promise.resolve()
    })
    invalidateTimeOff(qc, "m1")
    spy.mockRestore()
    expect(new Set(invalidated).size).toBe(4)
  })
})

describe("no screen types a query key by hand", () => {
  const SRC = path.join(process.cwd(), "src")
  function* walk(dir: string): Generator<string> {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== "__tests__" && e.name !== "node_modules") yield* walk(full)
      } else if (/\.tsx?$/.test(e.name)) yield full
    }
  }

  /**
   * File (relative to src/) → why the keys in it are typed by hand.
   *
   * Only for a key that backs NO request — a client-side computation cached
   * through React Query — so it has nothing to share a cache entry or an
   * invalidation with. Empty today: every key in the app reads the API.
   */
  const LOCAL_KEYS: Record<string, string> = {}

  /** Where a key array is written straight into a query or a QueryClient call. */
  const INLINE: RegExp[] = [
    /queryKey:\s*\[/g,
    /\b(?:get|set)Quer(?:y|ies)Data\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\(\s*\[/g,
    /\b(?:invalidate|refetch|reset|remove|cancel)Queries\(\s*\[/g,
    /\b(?:prefetch|fetch)(?:Infinite)?Query\(\s*\[/g,
    /\b(?:ensureQueryData|getQueryState)\(\s*\[/g,
  ]

  /** Comments blanked (newlines kept), so prose about an old key is not the key. */
  function code(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
  }

  function inlineKeys(src: string): string[] {
    const body = code(src)
    const found: string[] = []
    for (const re of INLINE) {
      for (const m of body.matchAll(re)) {
        const line = body.slice(0, m.index!).split("\n").length
        found.push(`${line}: ${body.slice(m.index!, m.index! + 60).split("\n")[0]!.trim()}`)
      }
    }
    return found
  }

  it("the scan recognises every way a key can be typed inline", () => {
    for (const planted of [
      `useQuery({ queryKey: ["x", id], queryFn })`,
      `qc.invalidateQueries({ queryKey: ["x"] })`,
      `qc.setQueryData(["x", id], v)`,
      `qc.getQueryData<{ a: Array<string> }>(["x", id])`,
      `qc.setQueriesData({ queryKey: ["x"] }, f)`,
      `qc.prefetchQuery({ queryKey: [...keys.tasks.lists(), "more"] })`,
    ]) {
      expect(inlineKeys(planted)).toHaveLength(1)
    }
    expect(inlineKeys(`// queryKey: ["x"]\nuseQuery({ queryKey: keys.tasks.lists() })`)).toEqual([])
  })

  it("every key comes from lib/query-keys.ts", () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f)
      if (rel === path.join("lib", "query-keys.ts") || rel.startsWith(path.join("lib", "query-keys") + path.sep) || LOCAL_KEYS[rel]) continue
      for (const hit of inlineKeys(fs.readFileSync(f, "utf8"))) offenders.push(`${rel}:${hit}`)
    }
    expect(offenders).toEqual([])
  })

  it("every allow-listed file still has a key of its own, and says why", () => {
    for (const [rel, why] of Object.entries(LOCAL_KEYS)) {
      expect(why.length).toBeGreaterThan(20)
      expect(inlineKeys(fs.readFileSync(path.join(SRC, rel), "utf8")).length).toBeGreaterThan(0)
    }
  })
})
