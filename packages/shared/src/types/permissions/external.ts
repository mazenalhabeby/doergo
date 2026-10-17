/** What an external member may hold, and the space-leader permission. */
import { ACCESS_PERMISSION_SCHEMA, PERMISSION_KEYS, type AccessPermissionKey, type PermissionSet } from './keys';
import { permissionsFromOrgRole } from './permission-sets';

/**
 * What an EXTERNAL member may hold — an allow-list, deliberately.
 *
 * An external member works for a client or a partner, not for the organization.
 * They hold a login to your tenant, so the question "what may they be given?"
 * gets a closed answer rather than an open one: a deny-list grants every
 * permission added after it was written, and grants it silently, to outsiders.
 * This list fails the other way — a new key is refused until somebody decides
 * otherwise, in a diff, on purpose. Same discipline as the billing gates, which
 * 402 on a key they do not recognise rather than waving it through.
 *
 * The line drawn: an external member may be given anything that is SCOPED TO
 * THE WORKSPACE they are assigned to — the work, the hours, the rota, that
 * workspace's clients, portal and equipment, its people — from watch-only up to
 * running the site (docs/plans/external-role-builder.md). Organization-scoped keys
 * never reach them, because an external member holds no org role at all.
 *
 * It stays an ALLOW-list, read from `external: true` on the schema: a key
 * nobody marked is refused. `canManageUsers` is space-capable and still not
 * marked — in a space it also sets what each person BILLS at, a price agreed
 * with the client, not by the client's person; adding people and giving roles
 * are their own keys for exactly that. Your personnel files, your
 * invoices, your other sites and your company's members belong to the
 * organization, and an outsider running one site has no claim on any of them.
 */
export const EXTERNAL_ALLOWED_PERMISSIONS: readonly AccessPermissionKey[] = ACCESS_PERMISSION_SCHEMA
  .filter((p) => p.external === true && p.scopes.includes('space'))
  .map((p) => p.key);

const EXTERNAL_ALLOWED = new Set<string>(EXTERNAL_ALLOWED_PERMISSIONS);

/**
 * A permission's human label, from the schema that already drives the role
 * builder. Server-side refusals name the permission the same way the checkbox
 * does, so an admin reading the error recognises what they just tried to grant.
 */
export function permissionLabel(key: string): string {
  return ACCESS_PERMISSION_SCHEMA.find((p) => p.key === key)?.label ?? key;
}

/** May an external member hold this permission at all? */
export function externalMayHold(key: string): boolean {
  return EXTERNAL_ALLOWED.has(key);
}

/**
 * Which permissions in `perms` an external member may NOT hold.
 *
 * Returns the offending keys rather than a boolean so the caller can name them
 * in the refusal — "you cannot grant this role to an external member" sends an
 * admin hunting through sixteen checkboxes; naming the two that are the problem
 * does not. Empty array = the grant is fine.
 */
export function externalForbiddenIn(perms: PermissionSet | null | undefined): AccessPermissionKey[] {
  const out: AccessPermissionKey[] = [];
  const p = perms ?? {};
  for (const key of PERMISSION_KEYS) {
    if (p[key] === true && !EXTERNAL_ALLOWED.has(key)) out.push(key);
  }
  return out;
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
