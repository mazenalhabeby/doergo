import {
  ACCESS_PERMISSION_SCHEMA,
  PERMISSION_KEYS,
  type AccessPermissionKey,
  type PermissionGrantScope,
  type PermissionSet,
} from '../types/permissions';

/**
 * The permission keys a role may carry, for each place a role is granted.
 *
 * Two services wrote this list out for themselves: auth-service whitelisted an
 * org role against every key, task-service whitelisted a workspace role against
 * the keys the schema marks as meaningful in a space. Two lists of what a role
 * may hold is how one of them starts accepting a key the other refuses — and
 * the role then means something different depending on which screen saved it.
 */

/** Keys that mean something on a SPACE role (read from the schema, never typed). */
export const SPACE_PERMISSION_KEYS: readonly AccessPermissionKey[] = ACCESS_PERMISSION_SCHEMA
  .filter((p) => p.scopes.includes('space'))
  .map((p) => p.key);

/**
 * An incoming `permissions` object, kept to known keys set to exactly `true`.
 *
 * Fail-closed: anything that is not a plain object is no permissions at all, a
 * truthy string is not `true`, and an unknown key is dropped rather than stored
 * for some later reader to honour.
 */
export function whitelistPermissions(
  input: unknown,
  scope: PermissionGrantScope = 'org',
): PermissionSet {
  const out: PermissionSet = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const r = input as Record<string, unknown>;
  const keys = scope === 'space' ? SPACE_PERMISSION_KEYS : PERMISSION_KEYS;
  for (const key of keys) if (r[key] === true) out[key] = true;
  return out;
}
