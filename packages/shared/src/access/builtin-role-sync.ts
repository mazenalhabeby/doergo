import { BUILTIN_ROLES, type RolePreset } from '../types/permissions';

/**
 * ⭐ BUILT-IN ROLES FOLLOW THEIR DEFINITION — ADDITIVELY, UNTIL AN ADMIN EDITS THEM.
 *
 * The rule, written once for every service that seeds built-ins (auth-service's
 * access panel, task-service's space-role panel). The task-service copy only
 * ever INSERTED a missing built-in, so a Space Manager seeded before its
 * definition gained a permission never received it — and which screen an admin
 * happened to open first decided what the role could do.
 *
 *   - A missing built-in is CREATED from its definition (`builtInRoleCreateData`).
 *   - An existing one GAINS what its definition grants and it lacks
 *     (`builtInRoleCatchUp`):
 *       ⚠️ ADD ONLY, NEVER REMOVE. Stored roles hold more than their
 *          definitions (migrations granted canManageAssets to every Manager),
 *          so copying the definition over them would silently take access away.
 *       ⚠️ AN EDITED ROLE IS THE ORGANIZATION'S OWN (`isCustomized`). Unticked
 *          permissions are stored as ABSENT, so "missing" cannot tell "never
 *          had it" from "an admin took it away" — only the flag can, and code
 *          never re-grants what an admin removed.
 *       Only `isSystem` rows; custom roles have no definition in code.
 *
 * Pure — no database. The caller reads, asks, and writes only what changed.
 */

/** The permissions a built-in definition GRANTS (true values only). */
export function builtInRoleGrants(def: Pick<RolePreset, 'permissions'>): Record<string, true> {
  const out: Record<string, true> = {};
  for (const [k, v] of Object.entries(def.permissions ?? {})) if (v === true) out[k] = true;
  return out;
}

/** The row to create when an organization lacks this built-in. */
export function builtInRoleCreateData(organizationId: string, def: RolePreset) {
  return {
    organizationId,
    name: def.name,
    slug: def.slug,
    description: def.description,
    color: def.color,
    scope: def.scope,
    isSystem: true,
    permissions: def.permissions,
  };
}

export interface StoredBuiltInRole {
  slug: string;
  isSystem: boolean;
  isCustomized: boolean;
  permissions: unknown;
  /** A personal role (one person, one workspace) is never a built-in, whatever its slug says. */
  personalAssignmentId?: string | null;
}

/**
 * What a stored built-in's permissions should become, or null when it must be
 * left alone (not a built-in, edited by an admin, or already holding it all).
 */
export function builtInRoleCatchUp(
  role: StoredBuiltInRole,
  definitions: readonly RolePreset[] = BUILTIN_ROLES,
): Record<string, unknown> | null {
  if (!role.isSystem || role.isCustomized || role.personalAssignmentId) return null;
  const def = definitions.find((d) => d.slug === role.slug);
  if (!def) return null;
  const granted = builtInRoleGrants(def);
  const stored = (role.permissions && typeof role.permissions === 'object' ? role.permissions : {}) as Record<string, unknown>;
  const missing = Object.keys(granted).filter((k) => stored[k] !== true);
  if (!missing.length) return null;
  return { ...stored, ...granted };
}
