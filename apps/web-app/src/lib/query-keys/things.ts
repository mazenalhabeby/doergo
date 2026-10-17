/**
 * Query keys for things and places: assets, workspaces, sharing, the portal, people, task extras,
 * reports, companies, billing.
 */
import { queryKey } from '@hbcfield/shared/client';
import { named } from './work';

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
  /** One colleague as Team shows them (GET /people/:id). */
  person: (id: string) => named("person", [id]),
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

export {
  assetsKeys,
  spacesKeys,
  sharedSpacesKeys,
  portalKeys,
  peopleKeys,
  taskExtrasKeys,
  reportsKeys,
  companiesKeys,
  meKeys,
  searchKeys,
  notificationsKeys,
  billingKeys,
};
