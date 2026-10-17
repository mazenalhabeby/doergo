import { isAdmin, spacesGranting, type AccessPermissionKey } from '@hbcfield/shared';

import type { SessionUser } from './request.types';
/**
 * The workspaces a list is narrowed to for one permission — THE rule for every
 * controller that passes a scope to a service.
 *
 *   null     org-wide: an administrator, or the key held as an ORG FLAG
 *   [ids]    only these workspaces
 *   []       granted nowhere — must match NOTHING
 *
 * ⚠️ The org flag is asked first, and that is the whole point of this helper.
 * The flags carry the bridges (ORG_FLAG_BRIDGES: canApproveAttendance ←
 * canReconcileAttendance | canManageUsers, …) and `access.org` does not spell
 * them out. Narrowing on `spacesGranting` alone let an org-wide Manager through
 * the guard — which reads the flag — and then handed the service an EMPTY list,
 * so they found nothing: allowed, and shown an empty page. Five controllers had
 * their own copy of the narrowing, and they disagreed on exactly this.
 *
 * ⚠️ null and [] must never collapse into one falsy test; that is how a
 * workspace-scoped caller would read every workspace in the organization.
 */
export function scopeFor(user: SessionUser | null | undefined, key: AccessPermissionKey): string[] | null {
  if (!user) return [];
  if (isAdmin(user) || user[key] === true) return null;
  return spacesGranting(user.access, key);
}

/**
 * `scopeFor` in the shape the services take: `undefined` = org-wide (no
 * narrowing), `[ids]` = only these, `[]` = nothing. Never write
 * `isAdmin(u) ? undefined : spacesGranting(...)` by hand — that skips the
 * org flag and its bridges (`permission-scope-guard.spec.ts`).
 */
export function scopeIdsFor(user: SessionUser | null | undefined, key: AccessPermissionKey): string[] | undefined {
  return scopeFor(user, key) ?? undefined;
}
