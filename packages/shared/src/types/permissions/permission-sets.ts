/** Permission sets: from legacy flags and role JSON, merged, compared (the grant ceiling). */
import { PERMISSION_KEYS, type PermissionSet } from './keys';

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

/** Union several permission sets (later sets do NOT override earlier trues). */
export function mergePermissions(...sets: (PermissionSet | null | undefined)[]): PermissionSet {
  const out: PermissionSet = {};
  for (const s of sets) {
    if (!s) continue;
    for (const key of PERMISSION_KEYS) {
      if (s[key] === true) out[key] = true;
    }
  }
  return out;
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
