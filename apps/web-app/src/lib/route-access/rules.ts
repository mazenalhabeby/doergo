/** What a route rule is, and how one is judged against the session (moved here unchanged) */
import {
  APPROVAL_KIND_SPECS,
  NAV_OPTION,
  accessAllows,
  accessAllowsAnywhere,
  crmCanAccess,
  crmReachOf,
  isAdmin,
  moduleAnywhere,
} from '@hbcfield/shared/client';

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

const APPROVAL_DECIDE_GRANTS: readonly Grant[] = [
  ...new Set(Object.values(APPROVAL_KIND_SPECS).map((k): Grant => `${k.orgWide ? "org" : "any"}:${k.decideKey}`)),
]

/**
 * CRM reach, as the server resolves it: the org role's caps, plus the crm* keys
 * of every workspace that runs the CRM (`crmReachOf`). An external member holds
 * no org-wide caps, so a workspace grant is their only way in — exactly the
 * client book of their one workspace.
 */
export function crmAccess(u: AccessUser): boolean {
  return crmCanAccess(
    crmReachOf(u.role, (u.access ?? null) as never, {
      // The session carries the union of modules, not one list per workspace; the
      // route's own `module: "crm"` asks the same. The server narrows per workspace.
      crmSpaces: () => moduleAnywhere(u as never, "crm"),
      isExternal: u.isExternal === true,
    }),
  )
}

const OPEN: AccessRule = { why: "every signed-in staff member — the server scopes what it returns" }

const REDIRECT: AccessRule = { why: "server-side redirect — the page it lands on is checked there" }

const MANAGE_USERS: Need[] = ["org:canManageUsers"]

const option = (href: string) => NAV_OPTION[href]

export { holdsOrgWide, holdsAnywhere, APPROVAL_DECIDE_GRANTS, OPEN, REDIRECT, MANAGE_USERS, option };
