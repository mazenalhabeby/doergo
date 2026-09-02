import { normalizeRole, Role } from "@hbcfield/shared/client"

/**
 * How a role is rendered — colour, gradient, and the i18n key for its label.
 *
 * This existed three times before (audit M-E1): `ROLE_CONFIG` in the members list,
 * a differently-shaped `ROLE_CONFIG` in the member detail page, and
 * `roleBadgeStyles` in the sidebar. Three shapes, three fallbacks, three colour
 * sets for one concept — and all three had already drifted:
 *
 *   - the detail page keyed on DISPATCHER / TECHNICIAN, roles retired 2026-07-16,
 *     so every real EMPLOYEE landed on the `TECHNICIAN` fallback;
 *   - the sidebar had no EMPLOYEE entry at all, so every employee fell back to the
 *     ADMIN style and wore a blue "admin" badge;
 *   - the sidebar also printed the raw enum (`EMPLOYEE`) instead of a translation.
 *
 * One map, keyed on the CANONICAL role only. Legacy names are folded in by
 * `normalizeRole` from the shared package rather than re-listed here, so retiring
 * or aliasing a role is still a one-place change.
 */
export interface RoleBadge {
  /** Tailwind classes for an outline badge (bg + text + border), both themes. */
  className: string
  /** The dot inside the badge — same treatment a named AccessRole gets, so the
   *  column reads as one system rather than two. */
  dotClassName: string
  /** Tailwind gradient stops, for avatar rings and headers. */
  gradient: string
  /** i18n key — never render the enum itself. */
  labelKey: string
}

const BADGES: Record<Role, RoleBadge> = {
  [Role.ADMIN]: {
    className:
      "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
    dotClassName: "bg-blue-500",
    gradient: "from-blue-500 to-blue-600",
    labelKey: "members.roles.admin",
  },
  [Role.EMPLOYEE]: {
    className:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50",
    dotClassName: "bg-emerald-500",
    gradient: "from-emerald-500 to-emerald-600",
    labelKey: "members.roles.employee",
  },
  [Role.CUSTOMER]: {
    className:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50",
    dotClassName: "bg-amber-500",
    gradient: "from-amber-500 to-amber-600",
    labelKey: "members.roles.customer",
  },
}

/**
 * How an EXTERNAL member reads, wherever their account type is shown.
 *
 * Not a role — it overrides one. Somebody a client sent to supervise one of our
 * sites holds the EMPLOYEE account type in the database, and printing
 * "Employee" for them is false in the one column an admin scans to see who is
 * on their team. They also hold no org role by construction, so without this
 * their cell shows the bare account type and nothing more specific, on every
 * screen.
 *
 * Amber, the colour the external treatment uses everywhere else.
 */
const EXTERNAL_BADGE: RoleBadge = {
  className:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/50 dark:border-amber-800/50",
  dotClassName: "bg-amber-500",
  gradient: "from-amber-500 to-amber-600",
  labelKey: "members.external.badge",
}

/**
 * Always returns a badge — an unknown or legacy role normalizes to EMPLOYEE, which
 * is the safe read (least privilege), not ADMIN.
 *
 * `isExternal` wins over the role, and it belongs HERE rather than at each call
 * site for the reason this file exists: the account-type badge was written out
 * three times before and all three had drifted. A fourth treatment decided per
 * screen is the same mistake with a new fact.
 */
export function roleBadge(role?: string | null, opts?: { isExternal?: boolean | null }): RoleBadge {
  if (opts?.isExternal) return EXTERNAL_BADGE
  return BADGES[normalizeRole(role || "")]
}

/**
 * The neutral dot/border colour for a custom AccessRole that has no colour set.
 * Token-based rather than a literal hex (audit M-F2).
 */
export const ROLE_COLOR_FALLBACK = "hsl(var(--muted-foreground))"
