/** Resolved access: one member's grants, org-wide and per workspace, and the questions asked of them. */
import { PERMISSION_KEYS, type AccessPermissionKey, type PermissionSet } from './keys';
import { mergePermissions, permissionsFromOrgRole, permissionsFromUserFlags } from './permission-sets';
import { spaceShareLevelToPermissions, type SharedSpaceGrant } from './space-share';

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
 * A grant that cannot be used without another one implies it: managing assets
 * without seeing them, answering portal requests without reading them.
 *
 * The guard checks ONE exact key while a service reads levels as a ladder, so a
 * role edited key by key to "manage assets" alone passed the service and was
 * refused every read at the guard. Applied in the resolver — the one place a
 * session's permissions are assembled — so every guard, narrowing and screen
 * sees the ladder the same way. Only ever ADDS what is below; never widens a
 * grant sideways (manage assets does not imply anything about tasks).
 */
export const IMPLIED_PERMISSIONS: Partial<Record<AccessPermissionKey, readonly AccessPermissionKey[]>> = {
  canManageAssets: ['canLogAssets', 'canViewAssets'],
  canLogAssets: ['canViewAssets'],
  canManagePortals: ['canAnswerPortal', 'canViewPortal'],
  canAnswerPortal: ['canViewPortal'],
};

/** A permission set with everything its grants imply added (one level deep is enough: each entry lists its whole ladder). */
export function withImpliedPermissions(set: PermissionSet): PermissionSet {
  const out: PermissionSet = { ...set };
  for (const key in IMPLIED_PERMISSIONS) {
    if (set[key as AccessPermissionKey] !== true) continue;
    for (const implied of IMPLIED_PERMISSIONS[key as AccessPermissionKey]!) out[implied] = true;
  }
  return out;
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
  /**
   * The account is an ADMIN — the organization's owner tier.
   *
   * Admins hold every org-wide permission BY BEING ADMINS, not by holding a role
   * that happens to list them. The product already says so out loud on the
   * member's Access tab: "Admins have every permission and module across the
   * whole organization."
   *
   * The resolver did not implement it. With ACCESS_IGNORE_LEGACY_FLAGS on, an
   * admin's permissions came from their assigned role alone — so saving that role
   * with an empty permission set reduced the organization's owner to nobody, in
   * their own organization, with no way back through the product. That happened
   * in production: an admin's role was saved as `{}` and the entire admin
   * navigation vanished; only a direct database update restored it.
   *
   * A tier that the UI describes as absolute must be absolute in the resolver, or
   * it is a promise the code does not keep.
   */
  isAdmin?: boolean;
}): ResolvedAccess {
  const org = input.isAdmin
    ? Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]))
    : mergePermissions(
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
  for (const spaceId in perSpace) perSpace[spaceId] = withImpliedPermissions(perSpace[spaceId]!);
  const access: ResolvedAccess = { org: withImpliedPermissions(org), perSpace };
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
 * Which spaces grant `key` — the list a query narrows to.
 *
 * The guard can only answer "may they, somewhere?" for a route that names no
 * space, and a list endpoint names none: `GET /attendance/entries` returns the
 * organization's time entries. Without this the guard widens and NOTHING
 * narrows, so a space-scoped grant reads every site in the company.
 *
 * Returns null when the permission is held ORG-WIDE, meaning "do not narrow" —
 * distinct from an empty array, which means "granted nowhere" and must return
 * nothing rather than everything. Those two collapsing into one falsy value is
 * exactly how a scoping bug becomes a data leak, so they are different types.
 */
export function spacesGranting(access: ResolvedAccess | null | undefined, key: AccessPermissionKey): string[] | null {
  if (!access) return [];
  if (access.org?.[key] === true) return null;
  const out: string[] = [];
  for (const spaceId in access.perSpace) {
    if (access.perSpace[spaceId]?.[key] === true) out.push(spaceId);
  }
  return out;
}

/**
 * How widely a member may create tasks, once the grant is taken into account.
 *
 * `taskCreationScope` is a COLUMN on the user (NONE | SELF | SPACE | ORG) and
 * `canCreateTasks` is a permission that a role can grant — two mechanisms for
 * one decision, and they can disagree. They did: a member granted "create
 * tasks" by a space role was refused with "You do not have permission to create
 * tasks", because the column still held the NONE their invitation defaulted to
 * and nothing ever recomputed it.
 *
 * The permission decides WHETHER; the column decides HOW WIDELY. So a column
 * saying NONE while the permission is held is not a restriction somebody chose
 * — it is a value nobody set — and it resolves to SPACE, the narrowest scope
 * that permits creating anything: their own assigned spaces.
 *
 * An explicit SELF, SPACE or ORG is always honoured. Taking the permission away
 * is how you stop somebody creating tasks; that is what it is for.
 */
export function resolveTaskCreationScope(
  column: string | null | undefined,
  access: ResolvedAccess | null | undefined,
): 'NONE' | 'SELF' | 'SPACE' | 'ORG' {
  const set = (column ?? '').toUpperCase();
  if (set === 'SELF' || set === 'SPACE' || set === 'ORG') return set;
  /*
    No column set: the role decides. An ORG-WIDE grant creates anywhere — a
    member given the Manager role after joining with a profile that could not
    create still has NONE in the column, and reading that as SPACE refused them
    in every workspace they were not rostered on. Only a grant held in spaces
    alone narrows to those spaces.
  */
  if (access?.org?.canCreateTasks === true) return 'ORG';
  return accessAllowsAnywhere(access, 'canCreateTasks') ? 'SPACE' : 'NONE';
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
export function accessAllowsAnywhere(access: ResolvedAccess | null | undefined, key: AccessPermissionKey): boolean {
  if (!access) return false;
  if (access.org?.[key] === true) return true;
  for (const spaceId in access.perSpace) {
    if (access.perSpace[spaceId]?.[key] === true) return true;
  }
  return false;
}
