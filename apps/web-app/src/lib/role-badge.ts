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
 * Always returns a badge — an unknown or legacy role normalizes to EMPLOYEE, which
 * is the safe read (least privilege), not ADMIN.
 */
export function roleBadge(role?: string | null): RoleBadge {
  return BADGES[normalizeRole(role || "")]
}

/**
 * The neutral dot/border colour for a custom AccessRole that has no colour set.
 * Token-based rather than a literal hex (audit M-F2).
 */
export const ROLE_COLOR_FALLBACK = "hsl(var(--muted-foreground))"
