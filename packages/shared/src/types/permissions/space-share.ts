/** A space shared with another organization, as permissions. */
import type { PermissionSet } from './keys';

// ── Resolved access (Phase 2) ────────────────────────────────────────────────
// The single, server-derived view of what a member can do: org-wide grants + a
// per-space grant map. Built ONCE at the session boundary (auth-service) from the
// unified model with legacy fallback, cached on the request user, and read by
// guards. Never assembled from client input — so a caller can't claim a space
// permission they don't hold.

/** Cross-org share level (mirrors the Prisma SpaceShareLevel enum as a union). */
export type SpaceShareLevel = 'VIEW' | 'CONTRIBUTE' | 'CONTROL';

/**
 * Map a cross-org share level → the space-scoped permissions it confers. Uses ONLY
 * the existing task permission keys, so a shared grant rides the exact same
 * per-space enforcement (`accessAllows(access, key, spaceId)`) as a native space
 * role — nothing bespoke, nothing that could widen beyond the space.
 *   VIEW       → read the board/tasks
 *   CONTRIBUTE → + create tasks / raise requests
 *   CONTROL    → + assign tasks & workers
 */
export function spaceShareLevelToPermissions(level: SpaceShareLevel): PermissionSet {
  switch (level) {
    case 'CONTROL':
      // canManageUsers is SPACE-scoped here — it only ever authorizes actions on
      // THIS shared space (via accessAllowsInSpace), letting a CONTROL guest add
      // their own workers to it. It is NOT an org-wide member-management grant.
      // canAddSpaceMembers: adding people now asks its own key (a space's canManageUsers
      // also sets bill rates); CONTROL keeps adding its own workers through it.
      return { canViewAllTasks: true, canCreateTasks: true, canAssignTasks: true, canManageUsers: true, canAddSpaceMembers: true };
    case 'CONTRIBUTE':
      return { canViewAllTasks: true, canCreateTasks: true };
    case 'VIEW':
    default:
      return { canViewAllTasks: true };
  }
}

/**
 * A foreign space this session may reach via a cross-org share. Carried on the
 * resolved access for (a) the guest UI ("Shared from {org}" + capabilities) and
 * (b) server-side widening — the set of `spaceId`s a guest's queries may include
 * IN ADDITION to their own org. Built ONLY from ACTIVE shares at session time.
 */
export interface SharedSpaceGrant {
  spaceId: string;
  ownerOrgId: string;
  ownerOrgName?: string;
  spaceName?: string;
  level: SpaceShareLevel;
  showWorkers: boolean;
  showAttendance: boolean;
  showTracking: boolean;
  showReports: boolean;
  allowRequests: boolean;
}
