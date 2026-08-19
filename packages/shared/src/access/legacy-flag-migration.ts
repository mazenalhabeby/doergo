/**
 * Retiring the per-member permission flags.
 *
 * A permission can currently be granted from two places at once: the flat
 * columns on the user row, and the role assigned to them. They are merged with
 * a union, and a union has no way to say no — so a role that omits a permission
 * does not withhold it, and moving someone to a narrower role removes nothing.
 * That is why "the role" cannot be relied on to describe what a person can do.
 *
 * The fix is to make the role the only source. It cannot be done by simply
 * ignoring the flags: anyone whose capability comes only from a flag would lose
 * it the moment the change deployed. So the flags are first written INTO roles,
 * user by user, such that everyone's resolved permissions are byte-for-byte
 * what they were — and only then does the resolver stop reading them.
 *
 * Pure, so the migration's decisions can be tested without a database.
 */

import { PERMISSION_KEYS, type PermissionSet, type AccessPermissionKey } from '../types/permissions';

/** What a user needs their role to grant, to keep exactly what they have now. */
export function targetRolePermissions(
  flagPermissions: PermissionSet | null | undefined,
  rolePermissions: PermissionSet | null | undefined,
): PermissionSet {
  const out: PermissionSet = {};
  for (const key of PERMISSION_KEYS) {
    if (flagPermissions?.[key] === true || rolePermissions?.[key] === true) out[key] = true;
  }
  return out;
}

/**
 * Does this user's role already cover everything their flags grant?
 *
 * True means the flags are dead weight for them and can simply stop being read
 * — no new role, no reassignment. In a healthy org this is most people.
 */
export function roleAlreadyCoversFlags(
  flagPermissions: PermissionSet | null | undefined,
  rolePermissions: PermissionSet | null | undefined,
): boolean {
  for (const key of PERMISSION_KEYS) {
    if (flagPermissions?.[key] === true && rolePermissions?.[key] !== true) return false;
  }
  return true;
}

/**
 * A stable identity for a permission set, so two users needing the same grants
 * share one role instead of each getting their own. Sorted, so key order in the
 * stored JSON cannot produce two names for one thing.
 */
export function permissionSignature(perms: PermissionSet | null | undefined): string {
  const granted = PERMISSION_KEYS.filter((k) => perms?.[k] === true).sort();
  return granted.length ? granted.join('+') : 'none';
}

/** The permissions a set grants, as a sorted list — for reporting and naming. */
export function grantedKeys(perms: PermissionSet | null | undefined): AccessPermissionKey[] {
  return PERMISSION_KEYS.filter((k) => perms?.[k] === true).sort();
}

/**
 * Would retiring the flags cost this user anything?
 *
 * The migration's safety property: after the backfill this must be false for
 * every user in the system. It is the check to run before flipping the switch,
 * not a description of what the switch does.
 */
export function wouldLosePermissions(
  flagPermissions: PermissionSet | null | undefined,
  resolvedRolePermissions: PermissionSet | null | undefined,
): AccessPermissionKey[] {
  return PERMISSION_KEYS.filter(
    (k) => flagPermissions?.[k] === true && resolvedRolePermissions?.[k] !== true,
  ).sort();
}
