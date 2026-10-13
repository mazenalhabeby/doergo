import type { QueryClient } from "@tanstack/react-query"
import { queryKey } from "@hbcfield/shared/client"

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

/*
Everything below is keyed by names chosen by hand before the endpoint table
existed. Their VALUES are exactly what the screens used to type inline, so
every cached entry and every prefix invalidation still matches; what changed
is that each name is now written once, here. Each factory takes the key's
trailing parts positionally, and called with fewer of them it is the prefix
that reaches them all — `keys.attendance.list()` invalidates every filter of
`keys.attendance.list(loc, status, …)`.
*/

const attendanceKeys = {
  /** The /attendance tracking board — `list()` reaches every filter, and the entry presence below. */
  list: (...filters: unknown[]) => named("attendance", filters),
  entryPresence: (entryId: string) => named("attendance", ["entry-presence", entryId]),
  approvals: () => named("attendance-approvals"),
  activeBreaks: () => named("attendance-breaks-active"),
  breakHistory: (...a: [date?: string, type?: string]) => named("attendance-breaks-history", a),
  breakSummary: (...a: [date?: string]) => named("attendance-breaks-summary", a),
  noShows: () => named("attendance-no-shows"),
  /** The dashboard's presence tiles. */
  active: () => named("attendance-active"),
  /** The dashboard's "on a break" tile. */
  dashboardBreaks: () => named("active-breaks"),
  /** The dashboard's approvals tile. */
  pendingApprovals: () => named("pending-approvals"),
  /** Per-workspace attendance on the dashboard. */
  locationBatch: (...a: [locKey?: string, day?: string]) => named("locationAttendanceBatch", a),
  /** Out-of-ring excursions; `excursions()` also reaches the active ones. */
  excursions: () => named("geofence-excursions"),
  activeExcursions: () => named("geofence-excursions", ["active"]),
  entryBreaks: (entryId: string) => named("entry-breaks", [entryId]),
  entryHistory: (entryId: string) => named("entryHistory", [entryId]),
  worklog: (entryId: string | null | undefined) => named("worklog", [entryId]),
  /** The caller's own shift — the navbar clock, /my/attendance and the rest panel. */
  myStatus: () => named("my-attendance-status"),
  myHistory: (...range: [from?: string, to?: string]) => named("my-attendance-history", range),
  myClockInLocations: () => named("my-clock-in-locations"),
  /** Member pickers on the add-entry / day-off dialogs. */
  employeesPicker: () => named("employeesForAttendance"),
  /** Workspace picker on a member's add-entry dialog. */
  locationsPicker: () => named("companyLocations"),
  /** "On the floor right now" on /employees/availability. */
  floorNow: () => named("floor-now"),
} as const

const overtimeKeys = {
  pending: () => named("overtime-pending"),
  history: (...a: [status?: string, page?: number]) => named("overtime-history", a),
} as const

const timeOffKeys = {
  /** The organization's leave — /attendance and /employees/availability; reaches both below. */
  org: () => named("orgTimeOff"),
  orgApproved: () => named("orgTimeOff", ["APPROVED"]),
  orgWindow: (start: string, end: string) => named("orgTimeOff", ["window", start, end]),
  /** One member's leave on their record. */
  member: (...a: [memberId?: string, status?: string]) => named("employeeTimeOff", a),
  mine: (userId: string | undefined) => named("my-time-off", [userId]),
  myBalance: (...a: [userId?: string]) => named("my-leave-balance", a),
  /** A member's leave-ledger lines (the leave year containing `on`); the prefix reaches every member. */
  ledger: (...a: [memberId?: string, on?: string]) => named("leave-adjustments", a),
  /** The starting balances table for the leave year containing `on`. */
  opening: (...a: [on?: string]) => named("leave-opening", a),
  /** The kinds of request the signed-in member may send, and where a remote day may be filed. */
  myOptions: (userId: string | undefined) => named("my-request-options", [userId]),
  /** What a range would cost, in working days. */
  count: (...a: [userId?: string, from?: string | null, to?: string | null]) => named("leave-count", a),
  /** The cover chart's footer. */
  coverRange: (...a: [start?: string, end?: string]) => named("cover-range", a),
  /** A member's jobs inside a leave request's window. */
  memberTasksInWindow: (memberId: string, start: string, end: string) => named("employee-tasks-window", [memberId, start, end]),
} as const

const schedulesKeys = {
  /** A member's working week. */
  member: (...a: [memberId?: string]) => named("employeeSchedule", a),
  rota: (spaceId: string) => named("rota", [spaceId]),
  shifts: (spaceId: string) => named("shifts", [spaceId]),
  breakRules: (spaceId: string) => named("break-rules", [spaceId]),
  rotaPeople: () => named("employees-for-rota"),
} as const

/** The approvals inbox (/approvals) and the count beside the bell. */
const approvalsKeys = {
  all: () => named("approvals"),
  list: () => named("approvals", ["list"]),
  count: () => named("approvals", ["count"]),
  route: (kind: string, id: string) => named("approvals", ["route", kind, id]),
  standIns: () => named("approvals", ["stand-ins"]),
} as const

const shiftIssuesKeys = {
  list: () => named("shift-issues"),
  detail: (id: string | null) => named("shift-issue", [id]),
  assignables: () => named("issue-assignables"),
} as const

/** A member's record (/members/[id]) and the dashboard's member panel. */

const memberRecordKeys = {
  tasks: (memberId: string) => named("memberTasks", [memberId]),
  tasksPage: (...a: [memberId: string, page?: number]) => named("memberTasksFull", a),
  attendance: (...a: [memberId?: string, from?: string, to?: string]) => named("memberAttendance", a),
  performance: (memberId: string) => named("memberPerformance", [memberId]),
  profile: (memberId: string) => named("employeeProfile", [memberId]),
  /** `assignments()` reaches every member's. */
  assignments: (...a: [memberId?: string]) => named("memberLocationAssignments", a),
  watchers: (memberId: string) => named("memberWatchers", [memberId]),
  statement: (memberId: string, from: string, to: string) => named("member-statement", [memberId, from, to]),
  custody: (...a: [memberId?: string]) => named("member-custody", a),
  /** A member's card in a workspace box on the dashboard. */
  employee: (memberId: string | null | undefined) => named("employee", [memberId]),
} as const

/** `employeesApi.list` pickers; `employees.all()` reaches every one. */

const employeesKeys = {
  all: () => named("employees"),
  shareInvite: () => named("employees", ["for-share"]),
  jobTimePicker: () => named("employees", ["job-time-picker"]),
} as const

const documentsKeys = {
  types: () => named("document-types"),
  /** Every type, archived included — reached by `types()`. */
  allTypes: () => named("document-types", ["all"]),
  drafts: () => named("document-drafts"),
  matchCandidates: () => named("document-match-candidates"),
  templates: () => named("document-templates"),
  templatePreview: (sampleId: string | null) => named("template-preview-values", [sampleId]),
  visibilityRoles: () => named("document-visibility-roles"),
  awaitingVerification: () => named("documents-awaiting-verification"),
  browse: (...a: [groupBy?: string, path?: string]) => named("documents-browse", a),
  sent: (...a: [tab?: string, search?: string, page?: number]) => named("documents-sent", a),
  compliance: () => named("credential-compliance"),
  mine: () => named("my-documents"),
  myRequirements: () => named("my-document-requirements"),
  myPending: () => named("my-pending-documents"),
} as const

const chatKeys = {
  conversations: () => named("chat", ["conversations"]),
  thread: (conversationId: string | null | undefined) => named("chat", ["thread", conversationId]),
  contacts: () => named("chat", ["contacts"]),
} as const

const supportKeys = {
  config: () => named("support", ["config"]),
  tickets: () => named("support", ["tickets"]),
  ticket: (id: string | null | undefined) => named("support", ["ticket", id]),
} as const

const calendarKeys = {
  /** Every calendar window. */
  all: () => named("calendar"),
  window: (from: string, to: string, scope: string, layers: string, lang: string) => named("calendar", [from, to, scope, layers, lang]),
  event: (...a: [eventId?: string | null]) => named("calendar-event", a),
  feed: () => named("calendar-feed"),
  holidays: (...a: [scope?: string, year?: number, lang?: string]) => named("calendar-holidays", a),
  settings: (...a: [year?: number, lang?: string]) => named("calendar-settings", a),
  countries: (lang: string) => named("calendar-countries", [lang]),
  regions: (country: string | null, lang: string) => named("calendar-regions", [country, lang]),
  people: (query: string) => named("calendar-people", [query]),
  availability: (ids: string, from: string) => named("calendar-availability", [ids, from]),
  /** A workspace's weekend and holidays for the cover chart. */
  team: (...a: [spaceId?: string, from?: string, to?: string]) => named("calendar-team", a),
} as const

const ratesKeys = {
  /** One rate's dated history (`target` = ORGANIZATION / SPACE / MEMBER / ASSIGNMENT). */
  history: (...a: [target: string, targetId?: string | null]) => named("rate-history", a),
} as const

const assetsKeys = {
  /** The org-wide list on /assets. */
  allList: (search: string, showRetired: boolean, page: number) => named("assets", ["all", search, showRetired, page]),
  record: (...a: [assetId?: string]) => named("asset", a),
  activities: (assetId: string) => named("asset-activities", [assetId]),
  tasks: (assetId: string) => named("asset-tasks", [assetId]),
  reports: (assetId: string) => named("asset-reports", [assetId]),
  custody: (...a: [assetId?: string]) => named("asset-custody", a),
  money: (...a: [assetId?: string]) => named("asset-money", a),
  log: (...a: [assetId?: string, type?: string, author?: string]) => named("asset-log", a),
  logSummary: (...a: [assetId?: string]) => named("asset-log-summary", a),
  /** A kind's records in a workspace. */
  records: (...a: [kindId?: string, status?: string, showRetired?: boolean]) => named("asset-records", a),
  /** A record's list field (faults, readings…). */
  rows: (...a: [assetId?: string, list?: string, search?: string, page?: number]) => named("asset-rows", a),
  categories: (spaceId: string | null | undefined) => named("asset-categories", [spaceId]),
  /** A workspace's asset kinds ("all" = every workspace). */
  kinds: (...a: [spaceId?: string | null]) => named("space-asset-kinds", a),
  orphans: () => named("orphan-assets"),
  expensesPending: () => named("asset-expenses-pending"),
  proposalsPending: (...a: [spaceId?: string]) => named("asset-proposals-pending", a),
  proposalPreview: (proposalId: string | undefined, categoryId: string, retire: boolean, fields: string) => named("proposal-preview", [proposalId, categoryId, retire, fields]),
  /** What each counted module holds (`assetsApi.getUsage`). */
  usage: () => named("module-usage"),
} as const

const spacesKeys = {
  /** A workspace's effective modules and workflow. */
  modules: (spaceId: string | null | undefined) => named("space-modules", [spaceId]),
  workflows: (spaceId: string | null | undefined) => named("space-workflows", [spaceId]),
  workflowLibrary: () => named("workflow-library"),
  workflow: (id: string | null | undefined) => named("workflow", [id]),
  /** Roles as one workspace sees them (holders, day rates). */
  roles: (...a: [spaceId?: string]) => named("space-roles-in-space", a),
  roleOptions: (spaceId: string | null | undefined) => named("role-options", [spaceId]),
  rolePreview: (spaceId: string | null | undefined, roleId: string | null | undefined, lat: number | null | undefined, lng: number | null | undefined) =>
    named("role-preview", [spaceId, roleId, lat, lng]),
  roleStats: (...a: [spaceId?: string | null]) => named("role-stats", a),
  memberUnits: (spaceId: string) => named("space-member-units", [spaceId]),
  units: (spaceId: string | null | undefined) => named("space-units", [spaceId]),
  portals: (spaceId: string | null | undefined) => named("space-portals", [spaceId]),
  portal: (spaceId: string | null | undefined) => named("space-portal", [spaceId]),
  shares: (spaceId: string) => named("space-shares", [spaceId]),
  shareRequests: (spaceId: string) => named("space-share-requests", [spaceId]),
  /** Rosters the caller may assign from. */
  visibleRosters: () => named("visible-rosters"),
} as const

const sharedSpacesKeys = {
  list: () => named("shared-spaces"),
  requests: (spaceId: string) => named("shared-space-requests", [spaceId]),
  workers: (spaceId: string) => named("shared-space-workers", [spaceId]),
  attendance: (spaceId: string) => named("shared-space-attendance", [spaceId]),
  tracking: (spaceId: string) => named("shared-space-tracking", [spaceId]),
} as const

const portalKeys = {
  detail: (portalId: string | null | undefined) => named("portal", [portalId]),
  residents: (portalId: string) => named("portalResidents", [portalId]),
  /** The office's inbox of portal requests — `allRequests()` reaches every portal's. */
  allRequests: (...a: [portalId?: string]) => named("portalAllRequests", a),
  availableUnits: (portalId: string) => named("portal-available-units", [portalId]),
  availableCustomers: (portalId: string) => named("portal-available-customers", [portalId]),
} as const

const peopleKeys = {
  invitations: (...a: [params?: object]) => named("invitations", a),
  pendingInvitations: () => named("pendingInvitations"),
  joinRequests: (...a: [params?: object]) => named("join-requests", a),
  joinCode: () => named("organization-join-code"),
  /** The contact directory (chat, the dashboard). */
  contacts: () => named("orgContacts"),
  phoneSyncHealth: () => named("phoneSyncHealth"),
  team: () => named("team"),
} as const

/** Task-adjacent reads outside the endpoint-derived `tasks` family. */

const taskExtrasKeys = {
  customFieldValues: (taskId: string) => named("customFieldValues", [taskId]),
  subtasks: (taskId: string) => named("subtasks", [taskId]),
  search: (query: string) => named("taskSearch", [query]),
  openForMe: () => named("open-for-me"),
  workerLocation: (workerId: string | null | undefined) => named("worker-location", [workerId]),
  jobTimeReport: (memberId: string | null, period: string) => named("job-time-report", [memberId, period]),
  /** A task's printable report (`reportQueryKey` builds the rest). */
  fullReport: (taskId: string, ...rest: string[]) => named("task-full-report", [taskId, ...rest]),
} as const

const reportsKeys = {
  catalog: () => named("analyticsCatalog"),
  saved: () => named("savedReports"),
  schedules: (...a: [savedId?: string]) => named("reportSchedules", a),
  auditLogs: (...filters: unknown[]) => named("audit-logs", filters),
  auditTrail: (resourceType: string, resourceId: string | undefined, limit: number) => named("auditTrail", [resourceType, resourceId, limit]),
} as const

/** Legal entities — `all()` is the picker's list and reaches the settings list too. */

const companiesKeys = {
  all: () => named("legal-entities"),
  includingInactive: () => named("legal-entities", ["all"]),
} as const

const meKeys = {
  notificationPrefs: () => named("my-notification-prefs"),
} as const

const searchKeys = {
  global: (query: string) => named("globalSearch", [query]),
} as const

const notificationsKeys = {
  inbox: () => named("inboxNotifications"),
} as const

const billingKeys = {
  /** The Stripe-side status the billing ribbon and the billing page read. */
  subscription: () => queryKey("billing.subscription"),
}

export const keys = {
  tasks: tasksKeys,
  members: membersKeys,
  locations: locationsKeys,
  spaceMembers: spaceMembersKeys,
  sprints: sprintsKeys,
  epics: epicsKeys,
  phases: phasesKeys,
  recurringTasks: recurringTasksKeys,
  customFields: customFieldsKeys,
  workflows: workflowsKeys,
  invoices: invoicesKeys,
  organization: organizationKeys,
  customers: customersKeys,
  attendance: attendanceKeys,
  overtime: overtimeKeys,
  timeOff: timeOffKeys,
  schedules: schedulesKeys,
  shiftIssues: shiftIssuesKeys,
  approvals: approvalsKeys,
  memberRecord: memberRecordKeys,
  employees: employeesKeys,
  documents: documentsKeys,
  chat: chatKeys,
  support: supportKeys,
  calendar: calendarKeys,
  rates: ratesKeys,
  assets: assetsKeys,
  spaces: spacesKeys,
  sharedSpaces: sharedSpacesKeys,
  portal: portalKeys,
  people: peopleKeys,
  taskExtras: taskExtrasKeys,
  reports: reportsKeys,
  companies: companiesKeys,
  me: meKeys,
  search: searchKeys,
  notifications: notificationsKeys,
  billing: billingKeys,
} as const

/**
 * Query keys that describe the SAME data from different angles.
 *
 * Time off is read under several keys — `timeOff.member` on a member's record,
 * `timeOff.org` on /attendance and /employees/availability, and the cover chart
 * and live floor on /employees/availability, which the server computes from
 * schedule + time-off. Each screen invalidated only its own, so approving a day
 * off in one place left the others showing it as still pending (audit MD-D1).
 * Schedules had the same split against the cover chart (MD-D2).
 *
 * Both helpers used to invalidate `["availability"]`, the key of a calendar that
 * no longer exists — it matched no query, so the cover chart was never told.
 *
 * These helpers exist so a caller does not have to know which other screens read
 * the thing they just changed — that knowledge lives here, once.
 */

/** Everything that renders time-off records. */
export function invalidateTimeOff(qc: QueryClient, memberId?: string): void {
  qc.invalidateQueries({ queryKey: timeOffKeys.member() })
  qc.invalidateQueries({ queryKey: timeOffKeys.org() })
  qc.invalidateQueries({ queryKey: timeOffKeys.coverRange() })
  if (memberId) qc.invalidateQueries({ queryKey: timeOffKeys.member(memberId) })
}

/**
 * Everything that renders a working week. The cover chart derives from the
 * schedule, so it is stale the moment one is saved.
 */
export function invalidateSchedule(qc: QueryClient, memberId?: string): void {
  qc.invalidateQueries({ queryKey: memberId ? schedulesKeys.member(memberId) : schedulesKeys.member() })
  qc.invalidateQueries({ queryKey: timeOffKeys.coverRange() })
}
