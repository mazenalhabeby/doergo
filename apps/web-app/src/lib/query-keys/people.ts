/**
 * Query keys for people's time: attendance, overtime, leave, rotas, approvals, issues, documents,
 * chat, the calendar, rates.
 */
import { named } from "./work"

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
  /** The no-show RECORD (one row per person) — the tab and its badge share it. */
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
  /** "On the floor right now" on /schedule. */
  floorNow: () => named("floor-now"),
} as const

const overtimeKeys = {
  pending: () => named("overtime-pending"),
  history: (...a: unknown[]) => named("overtime-history", a),
  summary: (...a: unknown[]) => named("overtime-summary", a),
  round: (id: string) => named("overtime-round", [id]),
} as const

const timeOffKeys = {
  /** The organization's leave — /attendance and /schedule; reaches both below. */
  org: () => named("orgTimeOff"),
  orgApproved: () => named("orgTimeOff", ["APPROVED"]),
  orgWindow: (start: string, end: string) => named("orgTimeOff", ["window", start, end]),
  /** The day-hours form's read for one person, day and workspace. */
  dayHours: (memberId: string, date: string, spaceId: string) => named("dayHours", [memberId, date, spaceId]),
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
  memberTasksInWindow: (memberId: string, start: string, end: string) =>
    named("employee-tasks-window", [memberId, start, end]),
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
  rules: () => named("approvals", ["rules"]),
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
  /** What the caller may do in chat (start a group). */
  capabilities: () => named("chat", ["capabilities"]),
  /** Words in the caller's own conversations (online only). */
  search: (q: string) => named("chat", ["search", q]),
  /** The caller's unread total — the top-bar badge. */
  badge: () => named("chat", ["badge"]),
} as const

const supportKeys = {
  config: () => named("support", ["config"]),
  tickets: () => named("support", ["tickets"]),
  ticket: (id: string | null | undefined) => named("support", ["ticket", id]),
} as const

const calendarKeys = {
  /** Every calendar window. */
  all: () => named("calendar"),
  window: (from: string, to: string, scope: string, layers: string, lang: string) =>
    named("calendar", [from, to, scope, layers, lang]),
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

export {
  attendanceKeys,
  overtimeKeys,
  timeOffKeys,
  schedulesKeys,
  approvalsKeys,
  shiftIssuesKeys,
  memberRecordKeys,
  employeesKeys,
  documentsKeys,
  chatKeys,
  supportKeys,
  calendarKeys,
  ratesKeys,
}
