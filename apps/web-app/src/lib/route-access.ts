/**
 * Who may open which page — ONE table, read by every way in.
 *
 * The dashboard layout used to ask three things of a signed-in member (signed
 * in, onboarded, not mobile-only) and then render ANY page they typed. Some
 * twenty pages drew their full shell around queries the gateway refused with a
 * 403, and the navbar, the settings list, the Manage hub and each page decided
 * "may this person be here?" with their own copy of the answer — which is how
 * the Team menu was offered to dispatchers whose every Team page 403s, and the
 * settings tab bar offered admin-only sections to everybody.
 *
 * Each entry mirrors the GATEWAY: the guard on the endpoints the page cannot
 * work without. The server stays the authority; this decides what is worth
 * rendering, and it must never be NARROWER than the server (a granted
 * permission that no surface offers is decorative) nor WIDER (a page that only
 * shows refusals reads as broken software).
 *
 * The four ways a grant is asked, matching the guards:
 *
 *   • `org:X`  — `@RequirePermission('X')`: PermissionsGuard reads the flat flag
 *                or the ORG-wide resolved access. An admin passes.
 *   • `any:X`  — `@RequirePermissionInSpace('X')`: held org-wide OR in any
 *                workspace (the service narrows to those workspaces).
 *   • `admin`  — `@Roles(Role.ADMIN)`.
 *   • an array — any one of the grants in it (an OR the page itself makes, e.g.
 *                "the directory, or your workspace's roster").
 *
 * Options (add-ons) are asked through `hasOption` — `hasPlanFeature` in the
 * app, which fails closed on anything that is not an add-on — and NEVER with a
 * module key. Modules are asked with `moduleAnywhere` (running in a workspace
 * this member can see).
 */
import {
  NAV_OPTION,
  SETTINGS_OPTION,
  isAdmin,
  accessAllows,
  accessAllowsAnywhere,
  moduleAnywhere,
  resolveCrmCaps,
  hasAccessModule,
} from "@hbcfield/shared/client"

// ─── The subject ────────────────────────────────────────────────────────────

/** The parts of the session this table reads. Structural, so tests need no full User. */
export interface AccessUser {
  role: string
  isExternal?: boolean
  offlineMode?: boolean
  enabledModules?: unknown
  orgModules?: string[]
  spaceModules?: string[] | null
  access?: {
    org?: Record<string, boolean>
    perSpace?: Record<string, Record<string, boolean>>
  } | null
  [flag: string]: unknown
}

export interface AccessContext {
  user: AccessUser
  /** What the organization BOUGHT — an Option key only (hasPlanFeature). */
  hasOption: (option: string) => boolean
}

export type Grant = "admin" | `org:${string}` | `any:${string}`

/** Each entry must hold; an array entry holds when any one grant in it does. */
type Need = Grant | readonly Grant[]

export interface AccessRule {
  /** Grants required (AND of entries; an array entry is an OR). */
  need?: readonly Need[]
  /** An Option (add-on) the organization must have bought. */
  option?: string
  /** A module that must be running in a workspace this member can see. */
  module?: string
  /** `@DenyExternal()` — the organization's own property. */
  denyExternal?: boolean
  /** Anything else the page needs, said in the code it mirrors. */
  when?: (ctx: AccessContext) => boolean
  /** The endpoint(s) this mirrors — for the next reader, and the test output. */
  why: string
}

export type DenyReason = "permission" | "external" | "option" | "module"

export type AccessVerdict = { ok: true } | { ok: false; reason: DenyReason }

// ─── Grants ─────────────────────────────────────────────────────────────────

const flag = (u: AccessUser, key: string) => u[key] === true

/** `@RequirePermission(key)` — PermissionsGuard, exactly. */
function holdsOrgWide(u: AccessUser, key: string): boolean {
  if (isAdmin({ role: u.role ?? "" })) return true
  return flag(u, key) || accessAllows(u.access as never, key as never)
}

/** `@RequirePermissionInSpace(key)` — org-wide, or in any workspace. */
function holdsAnywhere(u: AccessUser, key: string): boolean {
  return holdsOrgWide(u, key) || accessAllowsAnywhere(u.access as never, key as never)
}

export function holdsGrant(u: AccessUser, g: Grant): boolean {
  if (g === "admin") return isAdmin({ role: u.role ?? "" })
  if (g.startsWith("org:")) return holdsOrgWide(u, g.slice(4))
  return holdsAnywhere(u, g.slice(4))
}

function holdsNeed(u: AccessUser, n: Need): boolean {
  return typeof n === "string" ? holdsGrant(u, n as Grant) : (n as readonly Grant[]).some((g) => holdsGrant(u, g))
}

/** Evaluate one rule. Order: external, grants, then what was bought. */
export function evaluateRule(rule: AccessRule, ctx: AccessContext): AccessVerdict {
  const u = ctx.user
  if (rule.denyExternal && u.isExternal === true) return { ok: false, reason: "external" }
  if (rule.need && !rule.need.every((n) => holdsNeed(u, n))) return { ok: false, reason: "permission" }
  if (rule.when && !rule.when(ctx)) return { ok: false, reason: "permission" }
  if (rule.option && !ctx.hasOption(rule.option)) return { ok: false, reason: "option" }
  if (rule.module && !moduleAnywhere(u as never, rule.module)) return { ok: false, reason: "module" }
  return { ok: true }
}

// ─── Shared conditions ──────────────────────────────────────────────────────

/** CRM reach, as the server resolves it from the member's org role. */
function crmAccess(u: AccessUser): boolean {
  return resolveCrmCaps(u.role, (u.access?.org ?? undefined) as never).canAccess
}

const OPEN: AccessRule = { why: "every signed-in staff member — the server scopes what it returns" }
const REDIRECT: AccessRule = { why: "server-side redirect — the page it lands on is checked there" }

const MANAGE_USERS: Need[] = ["org:canManageUsers"]
const option = (href: string) => NAV_OPTION[href]

/**
 * Every page under app/(dashboard), by its route pattern (`[x]` = one segment).
 *
 * A test walks this against the folder: a page without an entry, or an entry
 * without a page, fails it.
 */
export const ROUTE_RULES: Readonly<Record<string, AccessRule>> = {
  "/dashboard": OPEN,
  "/profile": REDIRECT,
  "/sprints": REDIRECT,
  "/task-types": REDIRECT,
  "/schedule": REDIRECT, // → /employees/availability, checked below; the nav asks that entry
  "/employees": REDIRECT,
  "/employees/[id]": REDIRECT,

  // ── Work ──
  "/tasks": OPEN,
  "/tasks/[id]": { why: "GET /tasks/:id — the task service decides who may read the task" },
  "/tasks/[id]/report": { why: "GET /tasks/:id/full-report — checked against the task" },
  "/tasks/recurring": {
    need: ["admin"], option: "recurring",
    why: "GET /recurring-tasks; the page manages schedules for admins only (non-admins were pushed to /dashboard)",
  },
  "/issues": { why: "GET /shift-issues — @Roles(ADMIN, EMPLOYEE); a member sees what they reported, an overseer their sites" },
  "/calendar": { denyExternal: true, why: "CalendarController — @Roles(ADMIN, EMPLOYEE) @DenyExternal()" },
  "/team": { why: "GET /locations/team — teammates in the caller's own workspaces" },
  "/manage": {
    when: ({ user }) => hasAccessModule(user as never, "manage"),
    why: "the Manage hub — the member's access profile carries the `manage` screen",
  },
  "/shared/[id]": { need: ["org:canViewAllTasks"], why: "GET /shared-spaces — @RequirePermission('canViewAllTasks')" },

  // ── Workspaces ──
  "/locations": {
    need: [["org:canManageWorkspaces", "org:canManageUsers", "any:canViewAllTasks", "any:canViewSpaceAttendance"]],
    why: "GET /locations is service-scoped; the list is for whoever runs or oversees a workspace",
  },
  "/locations/[id]": { why: "the page checks canManageSpace for THIS workspace and says so itself" },
  "/locations/[id]/portals/[portalId]": {
    denyExternal: true, need: ["org:canManagePortals"], module: "b2c_portal",
    why: "GET /portal/admin/* — @DenyExternal() @RequirePermission('canManagePortals')",
  },

  // ── The organization's property ──
  "/clients": {
    denyExternal: true, module: "crm", when: ({ user }) => crmAccess(user),
    why: "GET /customers — @DenyExternal(), CRM caps in the service",
  },
  "/customers/[id]": {
    denyExternal: true, when: ({ user }) => crmAccess(user),
    why: "GET /customers/:id — @DenyExternal(), CRM caps + reach in the service (404 outside it)",
  },
  "/assets": {
    denyExternal: true, module: "assets", need: ["any:canViewAllTasks"],
    why: "GET /assets — @DenyExternal() @RequireModule('assets') @RequirePermissionInSpace('canViewAllTasks')",
  },
  "/assets/[id]": {
    denyExternal: true, module: "assets", need: ["org:canViewAllTasks"],
    why: "GET /assets/:id — @RequirePermission('canViewAllTasks'), the ORG-wide flag",
  },
  "/portals": {
    denyExternal: true, module: "b2c_portal", need: ["org:canManagePortals"],
    why: "GET /spaces/:id/portal/portals — @DenyExternal() @RequirePermission('canManagePortals')",
  },

  // ── People ──
  "/members": { need: MANAGE_USERS, why: "GET /organizations/members + /roles — @RequirePermission('canManageUsers')" },
  "/members/[id]": { need: MANAGE_USERS, why: "GET /organizations/members/:id — @RequirePermission('canManageUsers')" },
  "/members/phone-sync": {
    need: MANAGE_USERS, when: ({ user }) => user.offlineMode === true,
    why: "GET /sync/health — @RequirePermission('canManageUsers'); only meaningful with offline mode on",
  },
  "/invitations": { need: MANAGE_USERS, why: "GET /invitations — @RequirePermission('canManageUsers')" },
  "/join-requests": { need: MANAGE_USERS, why: "GET /join-requests — @RequirePermission('canManageUsers')" },
  "/employees/new": {
    need: ["any:canViewAllTasks"],
    why: "POST /employees — the page's own gate (admin or canViewAllTasks, in a workspace or org-wide)",
  },
  "/employees/availability": {
    denyExternal: true, option: option("/schedule"),
    need: [["any:canViewAllTasks", "any:canManageRota"]],
    why: "GET /employees/time-off — @RequirePermissionInSpace('canViewAllTasks'); the rota is the Shift Scheduling Option",
  },

  "/employees/leave-opening": {
    denyExternal: true,
    need: ["any:canManageRota"],
    why: "GET/POST /employees/leave-opening — @RequirePermissionInSpace('canManageRota'); the service narrows to the caller's workspaces",
  },

  // ── Time ──
  "/attendance": {
    need: ["any:canViewSpaceAttendance"],
    why: "GET /attendance/all-entries, /approvals/pending, /no-shows — @RequirePermissionInSpace('canViewSpaceAttendance')",
  },
  "/overtime": {
    need: ["any:canApproveOvertime"], option: option("/overtime"),
    why: "GET /overtime/* — @RequirePermissionInSpace('canApproveOvertime'), reads included",
  },
  "/my/attendance": {
    when: ({ user }) => hasAccessModule(user as never, "clock"),
    why: "the member's own shifts — the `clock` screen of their access profile",
  },
  "/my/time-off": {
    when: ({ user }) => hasAccessModule(user as never, "time_off"),
    why: "the member's own leave — the `time_off` screen of their access profile",
  },

  // ── Documents (the Option gates the pages; the server passes reads by design) ──
  "/my/documents": { option: "documents", why: "the member's own file — no permission, the Option only" },
  "/my/documents/[id]/sign": { option: "documents", why: "signing a document routed to the member — being on the step is the authority" },
  "/documents": {
    option: "documents", need: ["org:canIssueDocuments"],
    why: "GET /documents/match-candidates, /drafts — @RequirePermission('canIssueDocuments')",
  },
  "/documents/review": {
    option: "documents", need: ["org:canIssueDocuments"],
    why: "GET /documents/awaiting-verification — @RequirePermission('canIssueDocuments')",
  },
  "/documents/all": {
    option: "documents", need: ["org:canViewMemberDocuments"],
    why: "GET /documents/sent, /browse — @RequirePermission('canViewMemberDocuments')",
  },
  "/documents/templates": {
    option: "documents", need: ["org:canManageDocumentTemplates"],
    why: "GET /documents/templates — @RequirePermission('canManageDocumentTemplates')",
  },
  "/documents/types": {
    option: "documents", need: ["org:canManageDocumentTemplates"],
    why: "GET /documents/types?all=true — the catalogue's editor, the same permission as templates",
  },
  "/documents/compliance": {
    option: "documents", need: ["any:canAssignTasks"],
    why: "GET /documents/compliance — @RequirePermissionInSpace('canAssignTasks')",
  },

  // ── Money & reading ──
  "/reports": {
    denyExternal: true, need: [["any:canViewAllTasks", "any:canViewReports"]],
    why: "AnalyticsController — @DenyExternal() + ReportAccessGuard (canViewAllTasks or canViewReports, anywhere)",
  },
  "/reports/job-time": OPEN,
  "/invoices": {
    option: option("/invoices"), need: ["org:canManageInvoices"],
    why: "GET /invoices — @RequirePermission('canManageInvoices')",
  },
  "/invoices/new": { option: option("/invoices"), need: ["org:canManageInvoices"], why: "as /invoices" },
  "/invoices/[id]": { option: option("/invoices"), need: ["org:canManageInvoices"], why: "GET /invoices/:id — as /invoices" },
  "/invoices/[id]/edit": { option: option("/invoices"), need: ["org:canManageInvoices"], why: "as /invoices/[id]" },

  // ── Settings ──
  "/settings": OPEN, // the sections inside are checked by SETTINGS_SECTION_RULES
  "/settings/billing": { denyExternal: true, why: "GET /billing/bill — @DenyExternal(); reading is open, changing it is ADMIN" },
  "/settings/audit-log": {
    need: ["admin"], option: SETTINGS_OPTION["audit-log"],
    why: "GET /organizations/audit-logs — the org-wide log is ADMIN only (non-admins need a resourceId)",
  },
}

// ─── Settings sections ──────────────────────────────────────────────────────

type SettingsSectionKey =
  | "general" | "members" | "companies" | "notifications" | "holidays" | "audit-log"
  | "profile" | "security" | "my-emails"

export const SETTINGS_SECTION_RULES: Readonly<Record<SettingsSectionKey, AccessRule & { group: "org" | "personal" }>> = {
  general: { group: "org", need: ["admin"], why: "GET /organizations/profile — @Roles(ADMIN)" },
  members: { group: "org", need: MANAGE_USERS, why: "GET /organizations/join-code — @RequirePermission('canManageUsers')" },
  companies: { group: "org", need: ["admin"], why: "the legal companies and their bank details — writes are @Roles(ADMIN)" },
  notifications: { group: "org", need: ["admin"], why: "GET /organizations/profile, PATCH /notification-prefs — @Roles(ADMIN)" },
  holidays: {
    group: "org", denyExternal: true, need: ["org:canManageWorkspaces"],
    why: "GET /calendar/settings — @RequirePermission('canManageWorkspaces'), the ORG-wide flag",
  },
  "audit-log": {
    group: "org", need: ["admin"], option: SETTINGS_OPTION["audit-log"],
    why: "GET /organizations/audit-logs — org-wide for ADMIN only",
  },
  profile: { group: "personal", why: "the member's own profile" },
  security: { group: "personal", why: "the member's own password and sessions" },
  "my-emails": { group: "personal", why: "the member's own email opt-outs" },
}

/** The sections this member may open, in the order they are listed. */
export function settingsSectionsFor(ctx: AccessContext): SettingsSectionKey[] {
  return (Object.keys(SETTINGS_SECTION_RULES) as SettingsSectionKey[]).filter(
    (k) => evaluateRule(SETTINGS_SECTION_RULES[k], ctx).ok,
  )
}

/** Where /settings opens without a ?section: the first section this member may open. */
export function defaultSettingsSection(ctx: AccessContext): SettingsSectionKey {
  return settingsSectionsFor(ctx)[0] ?? "profile"
}

/** A requested section, or the default when it is unknown or not theirs. */
export function resolveSettingsSection(requested: string | null | undefined, ctx: AccessContext): SettingsSectionKey {
  const allowed = settingsSectionsFor(ctx)
  return allowed.includes(requested as SettingsSectionKey)
    ? (requested as SettingsSectionKey)
    : defaultSettingsSection(ctx)
}

// ─── Routes ─────────────────────────────────────────────────────────────────

function patternMatches(pattern: string, path: string): boolean {
  const ps = pattern.split("/").filter(Boolean)
  const xs = path.split("/").filter(Boolean)
  if (ps.length !== xs.length) return false
  return ps.every((seg, i) => (seg.startsWith("[") && seg.endsWith("]")) || seg === xs[i])
}

/** The table entry for a pathname — a literal segment beats a `[param]`. */
export function routeRuleFor(pathname: string): { pattern: string; rule: AccessRule } | null {
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/"
  let best: { pattern: string; rule: AccessRule; literals: number } | null = null
  for (const [pattern, rule] of Object.entries(ROUTE_RULES)) {
    if (!patternMatches(pattern, path)) continue
    const literals = pattern.split("/").filter((s) => s && !s.startsWith("[")).length
    if (!best || literals > best.literals) best = { pattern, rule, literals }
  }
  return best && { pattern: best.pattern, rule: best.rule }
}

/** May this member open this page? A path the table does not know is not ours to refuse. */
export function checkRoute(pathname: string, ctx: AccessContext): AccessVerdict {
  const hit = routeRuleFor(pathname)
  return hit ? evaluateRule(hit.rule, ctx) : { ok: true }
}

export function mayOpen(pathname: string, ctx: AccessContext): boolean {
  return checkRoute(pathname, ctx).ok
}

// ─── The navigation, as data ────────────────────────────────────────────────

/**
 * Where the bar OFFERS a page beyond being allowed to open it.
 *
 * Shift Issues is open to every member (they see what they reported), but the
 * menu entry is for whoever oversees the work; the colleague list is for the
 * office. These are offers, never permissions.
 */
const NAV_OFFER: Readonly<Record<string, (ctx: AccessContext) => boolean>> = {
  "/issues": ({ user }) => holdsAnywhere(user, "canViewAllTasks") || holdsOrgWide(user, "canManageUsers"),
  "/team": ({ user }) =>
    user.isExternal !== true &&
    (holdsAnywhere(user, "canViewAllTasks") || holdsAnywhere(user, "canAssignTasks") || holdsOrgWide(user, "canManageUsers")),
}

function offers(href: string, ctx: AccessContext): boolean {
  if (!mayOpen(href, ctx)) return false
  const extra = NAV_OFFER[href]
  return extra ? extra(ctx) : true
}

const TEAM_MENU = ["/members", "/invitations", "/join-requests", "/team"] as const
const TIME_MENU = ["/attendance", "/issues", "/schedule", "/overtime"] as const
const DOCUMENTS_MENU = [
  "/documents", "/documents/all", "/documents/review", "/documents/types", "/documents/templates", "/documents/compliance",
] as const

/** Where a nav href actually lands, for hrefs that are redirects. */
const NAV_TARGET: Readonly<Record<string, string>> = { "/schedule": "/employees/availability" }

/** Is this nav entry offered to this member? Redirect hrefs are asked of where they land. */
export function navOffers(href: string, ctx: AccessContext): boolean {
  return offers(NAV_TARGET[href] ?? href, ctx)
}

export interface NavModel {
  calendar: boolean
  clients: boolean
  assets: boolean
  portals: boolean
  team: string[]
  spaces: boolean
  time: string[]
  reports: boolean
  invoices: boolean
  documents: string[]
  manage: boolean
}

/** Everything the top bar offers this member — one function, so the bar and the tests agree. */
export function navModelFor(ctx: AccessContext): NavModel {
  const on = (href: string) => navOffers(href, ctx)
  const team = TEAM_MENU.filter(on)
  return {
    calendar: on("/calendar"),
    clients: on("/clients"),
    assets: on("/assets"),
    portals: on("/portals"),
    team,
    spaces: on("/locations"),
    time: TIME_MENU.filter(on),
    reports: on("/reports"),
    invoices: on("/invoices"),
    documents: DOCUMENTS_MENU.filter(on),
    // The Manage hub repeats the Team menu, so it shows only for whoever has no Team menu.
    manage: on("/manage") && team.length === 0,
  }
}
