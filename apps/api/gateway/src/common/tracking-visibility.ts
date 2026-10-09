import { isAdmin, spacesGranting } from '@hbcfield/shared';

/**
 * May this caller see where people ARE (coordinates, last location)?
 *
 * Coordinates are their own permission (`canViewTracking`), not a side effect
 * of being allowed to read a roster: "view all tasks" lets a manager see who
 * works here, not where each of them is standing. auth-service returns a
 * position only when `canViewTracking` is true, so it is resolved here, from
 * the caller's RESOLVED access, once for every route that reads people:
 *
 *   canViewTracking    administrator, or held org-wide
 *   trackingSpaceIds   the spaces it is held in when not org-wide (undefined
 *                      when org-wide). A per-person read can intersect these
 *                      with the person's own workspaces; until it does, a
 *                      per-space grant shows no coordinates — closed, not open.
 */
export function trackingVisibility(user: any): { canViewTracking: boolean; trackingSpaceIds: string[] | undefined } {
  if (!user) return { canViewTracking: false, trackingSpaceIds: [] };
  if (isAdmin(user)) return { canViewTracking: true, trackingSpaceIds: undefined };
  const granted = spacesGranting(user.access, 'canViewTracking');
  // The legacy flat column still counts as the org-wide answer where it is set.
  if (granted === null || user.canViewTracking === true) return { canViewTracking: true, trackingSpaceIds: undefined };
  return { canViewTracking: false, trackingSpaceIds: granted };
}
