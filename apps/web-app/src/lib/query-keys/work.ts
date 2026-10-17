/** Query keys for the work: tasks, members, workspaces, sprints, workflows, invoices, the organization, clients. */
import { queryKey } from '@hbcfield/shared/client';

/**
 * React Query keys, DERIVED from the endpoint table — never typed by hand.
 *
 *   useQuery({ queryKey: keys.tasks.detail(id), queryFn: () => tasksApi.getById(id) })
 *   qc.invalidateQueries({ queryKey: keys.tasks.lists() })   // every task list, any filter
 *
 * A key is `[domain, endpoint, args]` (shared `queryKey`): the endpoint the
 * query reads and the arguments it read it with, objects sorted and undefined
 * dropped. So two screens asking the same thing share one cache entry, and two
 * screens asking DIFFERENT things cannot collide on a hand-picked string. Both
 * happened: `["locations"]` held `GET /locations` on one page and
 * `GET /locations?limit=100` on another, and the member directory lived under
 * six keys with three page sizes.
 *
 * The endpoint is named by its table name (`"tasks.get"`), not imported: this
 * module is used by nearly every screen, and importing the definitions would put
 * the whole endpoint table into every page whether it calls those routes or not.
 * The spec checks every name against `apiEndpoints`.
 *
 * The prefixes (`lists()`, `details()`) are what a mutation invalidates; they
 * match exactly the queries of that endpoint and nothing else in the domain, so
 * a list-shaped `setQueriesData` can never touch a detail entry.
 */

/**
 * The members page's request — one function, so the menu's hover prefetch and
 * the page itself ask the same thing and land in the same cache entry (the
 * prefetch used to leave out `role` and warm a key nobody read).
 */
export function membersPageParams(search: string, role: string, page: number) {
  return { search: search || undefined, role, page, limit: 20 }
}

/** The member directory is read 200 at a time (the server's cap), every page. */
export const MEMBER_DIRECTORY_PAGE_SIZE = 200

/**
 * A hand-named key: `[name, ...parts]`. For the families that predate the
 * endpoint table — their values are kept as they were (see `keys` below).
 */
function named<N extends string>(name: N, parts: readonly unknown[] = []): readonly [N, ...unknown[]] {
  return [name, ...parts] as const
}

const tasksKeys = {
  /** Every task list, whatever its filter. */
  lists: () => queryKey("tasks.list"),
  list: (params?: object) => queryKey("tasks.list", params),
  /** Status / workspace counts (`params` as passed to `tasksApi.getStatusCounts`). */
  counts: (params?: { groupBy?: "status" | "space"; spaceId?: string }) => queryKey("tasks.counts", params),
  details: () => queryKey("tasks.get"),
  detail: (id: string | null | undefined) => queryKey("tasks.get", { id }),
  timelines: () => queryKey("tasks.timeline"),
  timeline: (id: string) => queryKey("tasks.timeline", { id }),
  times: () => queryKey("tasks.time"),
  time: (id: string | null | undefined) => queryKey("tasks.time", { id }),
  report: (id: string) => queryKey("tasks.report", { id }),
  submissions: (id: string) => queryKey("tasks.submissions", { id }),
  attachments: (id: string) => queryKey("tasks.attachments", { id }),
  routes: () => queryKey("tracking.taskRoute"),
  route: (taskId: string) => queryKey("tracking.taskRoute", { taskId }),
} as const

const membersKeys = {
  /** Every read of `GET /organizations/members` — the directory, a page, a picker. */
  lists: () => queryKey("organizations.members"),
  /** One page / one filter, exactly as passed to `organizationsApi.getMembers`. */
  list: (params?: object) => queryKey("organizations.members", params),
  /** The whole directory, every page (`organizationsApi.getAllMembers()`). */
  directory: () => queryKey("organizations.members", { all: true, limit: MEMBER_DIRECTORY_PAGE_SIZE }),
  /** The same, identity and presence only — for faces and names (`getAllMembers({ lite: true })`). */
  directoryLite: () => queryKey("organizations.members", { all: true, limit: MEMBER_DIRECTORY_PAGE_SIZE, lite: true }),
  details: () => queryKey("organizations.member"),
  detail: (id: string | null | undefined) => queryKey("organizations.member", { id }),
} as const

const locationsKeys = {
  /** Every list of workspaces, whatever its page size or filter. */
  lists: () => queryKey("locations.list"),
  list: (params?: object) => queryKey("locations.list", params),
  details: () => queryKey("locations.get"),
  detail: (id: string | null | undefined) => queryKey("locations.get", { id }),
  /** One workspace's roster (`locationsApi.getAssignedMembers`). */
  rosters: () => queryKey("locations.members"),
  roster: (id: string | null | undefined) => queryKey("locations.members", { id }),
  /** Several rosters in one read (`locationsApi.getRosters`). */
  rosterBatches: () => queryKey("locations.rosters"),
  rosterBatch: (ids: readonly string[]) => queryKey("locations.rosters", { ids: [...ids] }),
} as const

const spaceMembersKeys = {
  all: () => queryKey("spaceMembers.list"),
  list: (spaceId: string | null | undefined) => queryKey("spaceMembers.list", { spaceId }),
  /** What one person may do in one workspace — the permission builder's read. */
  permissions: (spaceId: string, assignmentId: string) => queryKey("spaceMembers.getPermissions", { spaceId, assignmentId }),
} as const

const sprintsKeys = {
  lists: () => queryKey("sprints.list"),
  list: (status?: string) => queryKey("sprints.list", status ? { status } : undefined),
} as const

const epicsKeys = { lists: () => queryKey("epics.list") } as const

const phasesKeys = { lists: () => queryKey("phases.list") } as const

const recurringTasksKeys = { lists: () => queryKey("recurringTasks.list") } as const

const customFieldsKeys = {
  /** Every read of the definitions — all of them, or a task type's. */
  definitionLists: () => queryKey("customFields.listDefinitions"),
  definitions: (params?: { forWorkflow?: string }) => queryKey("customFields.listDefinitions", params),
} as const

const workflowsKeys = { lists: () => queryKey("workflows.list") } as const

const invoicesKeys = {
  details: () => queryKey("invoices.getById"),
  detail: (id: string | null | undefined) => queryKey("invoices.getById", { id }),
  /** `["invoices"]` — hand-named, and a prefix of the endpoint keys above, so it reaches every list AND every open invoice. */
  all: () => named("invoices"),
  list: (status: string, company: string, spaceId: string | null | undefined) => named("invoices", [status, company, spaceId]),
  /** What a new invoice could bill (hours, days, expenses) — `gather()` reaches every source. */
  gather: (...a: [source?: object | null]) => named("invoice-gather", a),
} as const

const organizationKeys = {
  profile: () => queryKey("organizations.profile"),
  /** Every read of the access roles (org-wide and space-scoped). */
  roleLists: () => queryKey("organizations.roles"),
  /** `organizationsApi.getRoles(scope)` — "org" and no scope are the same request. */
  roles: (scope?: "org" | "space") => queryKey("organizations.roles", scope === "space" ? { scope } : undefined),
} as const

const customersKeys = {
  /** Every client list — the CRM, a workspace's tab, every picker. */
  lists: () => queryKey("customers.list"),
  list: (params?: object) => queryKey("customers.list", params),
  details: () => queryKey("customers.get"),
  detail: (id: string | null | undefined) => queryKey("customers.get", { id }),
  /** Below: hand-named families (see the note on `named`). */
  activities: (...a: [customerId?: string]) => named("customer-activities", a),
  addresses: (...a: [customerId?: string | null]) => named("customer-addresses", a),
  /** The people who work at a company. */
  contacts: (...a: [companyId?: string]) => named("customer-contacts", a),
  /** The companies a person is a contact at. */
  companies: (...a: [personId?: string]) => named("customer-companies", a),
  tasks: (customerId: string) => named("customer-tasks", [customerId]),
} as const

export {
  named,
  tasksKeys,
  membersKeys,
  locationsKeys,
  spaceMembersKeys,
  sprintsKeys,
  epicsKeys,
  phasesKeys,
  recurringTasksKeys,
  customFieldsKeys,
  workflowsKeys,
  invoicesKeys,
  organizationKeys,
  customersKeys,
};
