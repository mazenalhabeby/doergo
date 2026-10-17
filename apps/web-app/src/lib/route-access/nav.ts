/** Settings sections, matching a path to its rule, and what the navigation offers (moved here unchanged) */
import { SETTINGS_OPTION } from '@hbcfield/shared/client';
import {
  MANAGE_USERS,
  evaluateRule,
  holdsAnywhere,
  holdsOrgWide,
  type AccessContext,
  type AccessRule,
  type AccessVerdict,
} from './rules';
import { ROUTE_RULES } from './table';

// ─── Settings sections ──────────────────────────────────────────────────────

type SettingsSectionKey =
  | "general" | "members" | "companies" | "notifications" | "holidays" | "audit-log"
  | "profile" | "security" | "my-emails" | "clock-in"

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
  "clock-in": {
    group: "personal", denyExternal: true,
    why: "PATCH /users/me {clockInPick} — the member's own choice; an external member holds no clock",
  },
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
  // Who's who is for every member since 2026-10-15 (an external member works in one workspace and has no team directory).
  "/team": ({ user }) => user.isExternal !== true,
}

function offers(href: string, ctx: AccessContext): boolean {
  if (!mayOpen(href, ctx)) return false
  const extra = NAV_OFFER[href]
  return extra ? extra(ctx) : true
}

// Join requests and document checks are decided in Approvals (the old pages redirect there).
const TEAM_MENU = ["/members", "/invitations", "/team"] as const

const TIME_MENU = ["/attendance", "/issues", "/schedule", "/overtime"] as const

const DOCUMENTS_MENU = [
  "/documents", "/documents/all", "/documents/types", "/documents/templates", "/documents/compliance",
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
    // The Manage hub repeats the Team menu's management pages, so it shows only for
    // whoever has none of them — Colleagues alone (every member's) does not count.
    manage: on("/manage") && team.every((href) => href === "/team"),
  }
}
