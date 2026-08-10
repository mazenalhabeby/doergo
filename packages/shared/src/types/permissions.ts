/**
 * UNIFIED PERMISSION MODEL
 * ============================================================================
 * ONE permission vocabulary spanning every domain (tasks / members / reports /
 * attendance), used by BOTH org-wide roles and per-space roles. This is the
 * superset that replaces the two disjoint legacy sets:
 *   • User flags  (canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers, canViewReports)
 *   • SpaceRole   (canApproveOvertime, canManageRota, canReconcileAttendance, canViewSpaceAttendance)
 *
 * A `Role` (org or space scoped) holds a `PermissionSet`; a member's effective
 * access = their org role ∪ every space role they hold (resolved in Phase 2).
 *
 * Phase 1: this vocabulary + the mappers below let us backfill legacy data into
 * the unified `Role`/`SpaceAssignment` tables WITHOUT changing any behavior yet.
 */

/** Every permission key, flat camelCase (superset of the two legacy shapes). */
export const PERMISSION_KEYS = [
  // Tasks
  'canCreateTasks',
  'canViewAllTasks',
  'canAssignTasks',
  // Members
  'canManageUsers',
  // Reports
  'canViewReports',
  // Attendance (formerly space-only)
  'canApproveOvertime',
  'canManageRota',
  'canReconcileAttendance',
  'canViewSpaceAttendance',
] as const;

export type AccessPermissionKey = (typeof PERMISSION_KEYS)[number];

/** A set of granted permissions. Missing key = not granted (treated as false). */
export type PermissionSet = Partial<Record<AccessPermissionKey, boolean>>;

/** Where a permission may be granted. */
export type PermissionGrantScope = 'org' | 'space';

/** Domain grouping for UI. */
export type PermissionDomain = 'tasks' | 'members' | 'reports' | 'attendance';

/** Human-facing metadata for every permission — drives the role-builder UI. */
export const ACCESS_PERMISSION_SCHEMA: {
  key: AccessPermissionKey;
  label: string;
  description: string;
  domain: PermissionDomain;
  /** Scopes where granting this permission is meaningful. */
  scopes: PermissionGrantScope[];
}[] = [
  { key: 'canCreateTasks', label: 'Create tasks', description: 'Create new tasks', domain: 'tasks', scopes: ['org', 'space'] },
  { key: 'canViewAllTasks', label: 'View all tasks', description: 'See every task in scope, not just own/assigned', domain: 'tasks', scopes: ['org', 'space'] },
  { key: 'canAssignTasks', label: 'Assign tasks', description: 'Assign tasks to members', domain: 'tasks', scopes: ['org', 'space'] },
  { key: 'canManageUsers', label: 'Manage members', description: 'Invite, edit and remove members (org) / manage this space’s members (space)', domain: 'members', scopes: ['org', 'space'] },
  { key: 'canViewReports', label: 'View reports', description: 'Build and run reports', domain: 'reports', scopes: ['org', 'space'] },
  { key: 'canApproveOvertime', label: 'Approve overtime', description: 'Approve extra-time requests', domain: 'attendance', scopes: ['org', 'space'] },
  { key: 'canManageRota', label: 'Manage rota', description: 'Create shifts and assign members to shifts', domain: 'attendance', scopes: ['org', 'space'] },
  { key: 'canReconcileAttendance', label: 'Reconcile attendance', description: 'Close/fix open attendance entries', domain: 'attendance', scopes: ['org', 'space'] },
  { key: 'canViewSpaceAttendance', label: 'View attendance', description: 'See attendance for everyone in scope', domain: 'attendance', scopes: ['org', 'space'] },
];

/** Role scope — mirrors the Prisma `RoleScope` enum. */
export type RoleScope = 'ORG' | 'SPACE' | 'BOTH';

/** A built-in role definition (seeded per org, editable, non-deletable). */
export interface RolePreset {
  slug: string;
  name: string;
  description: string;
  color: string;
  scope: RoleScope;
  permissions: PermissionSet;
}

const allPermissions = (): PermissionSet =>
  Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as PermissionSet;

/**
 * Built-in roles seeded once per organization. Space slugs (space-manager,
 * shift-leader, team-leader) deliberately match the legacy `SpaceRole` built-ins
 * so backfill MERGES them rather than duplicating.
 */
export const BUILTIN_ROLES: RolePreset[] = [
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Organization owner — full control',
    color: '#1e293b',
    scope: 'ORG',
    permissions: allPermissions(),
  },
  {
    slug: 'manager',
    name: 'Manager',
    description: 'Org-wide manager under the admin. Handles all spaces with the permissions the admin grants.',
    color: '#2563eb',
    scope: 'ORG',
    permissions: {
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
      canViewReports: true,
      canApproveOvertime: true,
      canViewSpaceAttendance: true,
    },
  },
  {
    slug: 'space-manager',
    name: 'Space Manager',
    description: 'Full authority within their assigned space(s) — incl. managing members',
    color: '#2563eb',
    scope: 'SPACE',
    permissions: {
      canManageUsers: true, // manages members + routing WITHIN this space (delegation)
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: true,
      canApproveOvertime: true,
      canManageRota: true,
      canReconcileAttendance: true,
      canViewSpaceAttendance: true,
    },
  },
  {
    slug: 'shift-leader',
    name: 'Shift Leader',
    description: 'Approves overtime and reconciles open shifts in their space',
    color: '#16a34a',
    scope: 'SPACE',
    permissions: {
      canApproveOvertime: true,
      canReconcileAttendance: true,
      canViewSpaceAttendance: true,
    },
  },
  {
    slug: 'team-leader',
    name: 'Team Leader',
    description: 'Approves overtime for their team in their space',
    color: '#ca8a04',
    scope: 'SPACE',
    permissions: {
      canApproveOvertime: true,
      canViewSpaceAttendance: true,
    },
  },
];

// ── Mappers: legacy → unified (used by the Phase 1 backfill) ─────────────────

/** Keep only known permission keys with boolean-true values. */
function pickPermissions(raw: unknown): PermissionSet {
  const out: PermissionSet = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const key of PERMISSION_KEYS) {
    if (r[key] === true) out[key] = true;
  }
  return out;
}

/** Org-level permission flags on the legacy User row → unified set. */
export function permissionsFromUserFlags(u: {
  canCreateTasks?: boolean | null;
  canViewAllTasks?: boolean | null;
  canAssignTasks?: boolean | null;
  canManageUsers?: boolean | null;
  canViewReports?: boolean | null;
}): PermissionSet {
  const out: PermissionSet = {};
  if (u.canCreateTasks) out.canCreateTasks = true;
  if (u.canViewAllTasks) out.canViewAllTasks = true;
  if (u.canAssignTasks) out.canAssignTasks = true;
  if (u.canManageUsers) out.canManageUsers = true;
  if (u.canViewReports) out.canViewReports = true;
  return out;
}

/** A role's `permissions` JSON (org or space AccessRole) → whitelisted set. */
export function permissionsFromOrgRole(raw: unknown): PermissionSet {
  return pickPermissions(raw);
}

/** Legacy `SpaceRole.permissions` JSON → unified set (attendance keys). */
export function permissionsFromSpaceRole(raw: unknown): PermissionSet {
  return pickPermissions(raw);
}

/** Union several permission sets (later sets do NOT override earlier trues). */
export function mergePermissions(
  ...sets: (PermissionSet | null | undefined)[]
): PermissionSet {
  const out: PermissionSet = {};
  for (const s of sets) {
    if (!s) continue;
    for (const key of PERMISSION_KEYS) {
      if (s[key] === true) out[key] = true;
    }
  }
  return out;
}

/** Whether a permission set grants a given key. */
export function permissionAllows(
  perms: PermissionSet | null | undefined,
  key: AccessPermissionKey,
): boolean {
  return perms?.[key] === true;
}

/**
 * Ceiling check: does `targetPerms` grant any permission `requesterPerms` lacks?
 * Used to stop a non-admin from assigning/authoring a role that would grant more
 * than they themselves hold (privilege escalation via memberRoleId / role authoring
 * / invitation pre-assignment). A true ADMIN bypasses this entirely at the caller.
 */
export function permissionsExceed(
  requesterPerms: PermissionSet | null | undefined,
  targetPerms: PermissionSet | null | undefined,
): boolean {
  const req = requesterPerms ?? {};
  const tgt = targetPerms ?? {};
  for (const key of PERMISSION_KEYS) {
    if (tgt[key] === true && req[key] !== true) return true;
  }
  return false;
}

/**
 * The permission that marks a role as a space "leader" — the default recipient
 * for notifications ABOUT members in the space, and the default contact target
 * for those members. All three built-in space roles (space-manager, shift-leader,
 * team-leader) carry it, so "no explicit config" resolves to the space leadership.
 */
export const SPACE_LEADER_PERMISSION: AccessPermissionKey = 'canViewSpaceAttendance';

/** Whether a role's permissions JSON marks it as a space leader (see above). */
export function isSpaceLeaderPermissions(perms: unknown): boolean {
  return permissionsFromOrgRole(perms)[SPACE_LEADER_PERMISSION] === true;
}

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
      return { canViewAllTasks: true, canCreateTasks: true, canAssignTasks: true };
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

export interface ResolvedAccess {
  /** Permissions that apply org-wide (everywhere). */
  org: PermissionSet;
  /** Permissions that apply only within a given space id. */
  perSpace: Record<string, PermissionSet>;
  /**
   * Foreign spaces reachable via a cross-org share (empty/absent for most users).
   * The `spaceId`s here are the ONLY foreign spaces a guest may touch; services
   * widen their org filter to exactly these, never further.
   */
  sharedSpaces?: SharedSpaceGrant[];
}

/**
 * Build the resolved access from raw session inputs. Every source is run through
 * the whitelisting mappers, so unknown/injected JSON keys are dropped — only the
 * known permission vocabulary can ever grant anything.
 *
 * org = user flags ∪ unified memberRole  (a strict SUPERSET of today's flags, so
 * nothing a user can do today is ever removed).
 */
export function buildResolvedAccess(input: {
  userFlags?: Parameters<typeof permissionsFromUserFlags>[0];
  memberRolePermissions?: unknown; // unified AccessRole.permissions (org-scoped)
  spaces?: { spaceId: string; permissions?: unknown }[]; // unified space grants
  sharedSpaces?: SharedSpaceGrant[]; // cross-org shares received by this user's org (ACTIVE only)
}): ResolvedAccess {
  const org = mergePermissions(
    input.userFlags ? permissionsFromUserFlags(input.userFlags) : undefined,
    permissionsFromOrgRole(input.memberRolePermissions),
  );
  const perSpace: Record<string, PermissionSet> = {};
  for (const s of input.spaces ?? []) {
    if (!s?.spaceId) continue;
    perSpace[s.spaceId] = mergePermissions(perSpace[s.spaceId], permissionsFromOrgRole(s.permissions));
  }
  // Cross-org shares: merge the level's space-scoped permissions for each foreign
  // space. These are the ONLY foreign spaces this session can reach.
  for (const g of input.sharedSpaces ?? []) {
    if (!g?.spaceId) continue;
    perSpace[g.spaceId] = mergePermissions(perSpace[g.spaceId], spaceShareLevelToPermissions(g.level));
  }
  const access: ResolvedAccess = { org, perSpace };
  if (input.sharedSpaces && input.sharedSpaces.length) access.sharedSpaces = input.sharedSpaces;
  return access;
}

/**
 * Does the resolved access grant `key` — org-wide, or (only when a
 * SERVER-AUTHORITATIVE spaceId is supplied) within that space? Callers must pass
 * the resource's own spaceId, never a client-provided one, to avoid granting a
 * permission held in space A while acting on space B.
 */
export function accessAllows(
  access: ResolvedAccess | null | undefined,
  key: AccessPermissionKey,
  spaceId?: string,
): boolean {
  if (!access) return false;
  if (access.org?.[key] === true) return true;
  if (spaceId && access.perSpace?.[spaceId]?.[key] === true) return true;
  return false;
}

/**
 * SPACE-ONLY grant check — does the resolved access grant `key` within THIS exact
 * space, with NO org-wide fallback? Use this to authorize actions on a FOREIGN
 * (cross-org shared) resource: `perSpace[spaceId]` is populated only by a native
 * space assignment (own org) or an ACTIVE cross-org share, so for a foreign space
 * this is true iff a share grants it at the right level. The org short-circuit in
 * `accessAllows` must NEVER authorize a foreign space (that would let a guest's
 * own-org permissions leak across the tenant boundary).
 */
export function accessAllowsInSpace(
  access: ResolvedAccess | null | undefined,
  key: AccessPermissionKey,
  spaceId?: string,
): boolean {
  if (!access || !spaceId) return false;
  return access.perSpace?.[spaceId]?.[key] === true;
}

/**
 * Whether the user holds `key` org-wide OR in ANY space — for endpoints whose
 * resource space isn't yet known (the concrete resource is then re-checked with
 * its real spaceId in the service layer). Widens visibility only, never mutation.
 */
export function accessAllowsAnywhere(
  access: ResolvedAccess | null | undefined,
  key: AccessPermissionKey,
): boolean {
  if (!access) return false;
  if (access.org?.[key] === true) return true;
  for (const spaceId in access.perSpace) {
    if (access.perSpace[spaceId]?.[key] === true) return true;
  }
  return false;
}
