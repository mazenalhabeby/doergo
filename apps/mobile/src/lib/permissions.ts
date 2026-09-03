import { accessAllowsAnywhere, isAdmin as isAdminRole } from '@hbcfield/shared/client';

/**
 * Does this member hold a permission — org-wide, or in any space?
 *
 * The mobile app asks about ROLES where the web app asks about permissions, and
 * the two have drifted apart: a Space Manager or a client's supervisor holds
 * real authority through a space role and `role === ADMIN` is false for both, so
 * every screen behind that test was invisible to exactly the people it was for.
 *
 * The flat columns carry only the ORG-wide resolution, which is why they cannot
 * be the whole answer either. This asks both, in the order the server does.
 *
 * Any-space is the right test for what to RENDER. It cannot widen real access:
 * the API resolves the permission against the resource's own space and refuses
 * independently — so the worst a wrong answer here does is show or hide a
 * control.
 */
export function holds(
  user:
    | {
        role?: string | null;
        access?: { org?: Record<string, boolean>; perSpace?: Record<string, Record<string, boolean>> } | null;
      }
    | null
    | undefined,
  key: string,
): boolean {
  if (!user) return false;
  // An admin holds everything by being one, exactly as PermissionsGuard decides
  // it — a built-in role's stored permissions are a snapshot and never gain keys
  // added to the catalogue afterwards.
  if (isAdminRole(user as never)) return true;
  if ((user as unknown as Record<string, unknown>)[key] === true) return true;
  return accessAllowsAnywhere(user.access as never, key as never);
}

/**
 * Does this member hold a permission ORG-WIDE?
 *
 * The narrower question, and the honest one for a screen behind
 * `@RequirePermission` — that guard reads the flat columns and the resolved ORG
 * access, and a grant held in one space does not satisfy it however senior the
 * space role is. Offering such a screen to a space-scoped member produces a tab
 * that only ever 403s.
 */
export function holdsOrgWide(user: Parameters<typeof holds>[0], key: string): boolean {
  if (!user) return false;
  if (isAdminRole(user as never)) return true;
  if ((user as unknown as Record<string, unknown>)[key] === true) return true;
  return (user.access?.org as Record<string, boolean> | undefined)?.[key] === true;
}

/**
 * Is this person OVERSEEING work rather than doing it?
 *
 * The question mobile actually asks in half a dozen places, currently phrased as
 * `role === ADMIN`. A supervisor of one site oversees the work there and does
 * not execute it, and they are not an admin — so they were shown a field
 * worker's screens: a timer, a checklist, their own task list.
 *
 * `canViewAllTasks` is the marker, because seeing everyone's work IS the
 * difference between overseeing and doing. Held org-wide it means the whole
 * organization; held in a space it means that site — and every list behind it
 * is already narrowed to the spaces they hold.
 */
export function oversees(
  user: Parameters<typeof holds>[0],
): boolean {
  return holds(user, 'canViewAllTasks');
}
