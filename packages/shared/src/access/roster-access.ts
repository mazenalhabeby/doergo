import { accessAllows, type AccessPermissionKey, type ResolvedAccess } from '../types/permissions';
import { isAdmin } from '../guards/role-helpers';

/**
 * May this caller manage THIS workspace's people — admin, `canManageUsers`
 * org-wide (the column or a role), or `canManageUsers` granted in this exact
 * space (the space-manager delegation). The space must be the RESOURCE's id
 * (the route's), never one the client chose separately.
 *
 * Asked wherever a member's terms in a workspace (their bill rate there) ride
 * on a response — a price negotiated for one person at one client is the
 * space manager's business, not every colleague's.
 */
export function mayManageSpaceMembers(user: unknown, spaceId: string): boolean {
  const u = user as { canManageUsers?: boolean; access?: ResolvedAccess } | null | undefined;
  if (!u) return false;
  if (isAdmin(u as any)) return true;
  if (u.canManageUsers === true) return true;
  return accessAllows(u.access, 'canManageUsers', spaceId);
}

/**
 * The permissions that make a workspace's roster readable in full: following
 * its work, assigning it, supervising its attendance, managing its people.
 */
const ROSTER_VIEW_KEYS: AccessPermissionKey[] = ['canViewAllTasks', 'canAssignTasks', 'canViewSpaceAttendance', 'canManageUsers'];

/**
 * May this caller read THIS workspace's roster regardless of their own
 * assignments? Admin, the legacy org-wide column, or one of the viewing grants
 * held org-wide or in this exact space. An EXTERNAL member reaches a roster
 * only this way — the External Supervisor holds canViewSpaceAttendance in the
 * space they supervise, and that is the roster they need; nowhere else.
 */
export function mayViewSpaceRoster(user: unknown, spaceId: string): boolean {
  const u = user as { canViewAllTasks?: boolean; isExternal?: boolean; access?: ResolvedAccess } | null | undefined;
  if (!u) return false;
  if (isAdmin(u as any)) return true;
  if (u.canViewAllTasks === true && u.isExternal !== true) return true;
  return ROSTER_VIEW_KEYS.some((k) => accessAllows(u.access, k, spaceId));
}

/** What a roster row may carry to somebody who does not manage the workspace. */
const SPACE_TERMS_KEYS = new Set(['billRateCents']);

/**
 * Remove a member's negotiated terms in a workspace (their bill rate there)
 * from a roster on its way to somebody who does not manage that workspace.
 * Cost rates are a separate rule (`stripCostRates`, the labour-cost boundary).
 */
export function stripSpaceTerms<T>(rows: T, mayManage: boolean): T {
  if (mayManage || !Array.isArray(rows)) return rows;
  return rows.map((r) => omitKeys(r, SPACE_TERMS_KEYS)) as unknown as T;
}

/**
 * What a WORKSPACE record may not carry to somebody who does not manage it: the
 * client's contact person (name, e-mail, phone) and the workspace's rates. The
 * list already drops the contact fields; the single read (`GET /locations/:id`)
 * returned all of it to anybody who could see the workspace.
 */
const WORKSPACE_TERMS_KEYS = new Set(['contactName', 'contactEmail', 'contactPhone', 'billableRateCents', 'costRateCents']);

/** One workspace record with its client contact and rates removed unless the caller manages it. */
export function stripWorkspaceTerms<T>(space: T, mayManage: boolean): T {
  if (mayManage) return space;
  return omitKeys(space, WORKSPACE_TERMS_KEYS);
}

function omitKeys<T>(r: T, keys: ReadonlySet<string>): T {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) if (!keys.has(k)) out[k] = v;
  return out as T;
}
