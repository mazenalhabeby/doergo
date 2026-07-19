import { tierAllows, hasFeatureModule, AVAILABLE_MODULES, type PlanTier } from '@hbcfield/shared';

/** Catalog module keys (toggleable via enabledModules). Capabilities are NOT here. */
const MODULE_KEYS = new Set<string>(AVAILABLE_MODULES.map((m) => m.key));

/**
 * Single source of truth for "can this org use feature <key>?".
 *
 * A feature is available iff the org's TIER entitles it AND — for catalog
 * modules — the org has it enabled. Capabilities (recurring, invoicing, …) are
 * gated by tier alone. O(1): reads planTier/orgModules off the cached req.user,
 * no DB. Used by ModuleGuard, the task-field gate and inline read-gates so tier
 * enforcement can never diverge across call sites.
 */
export function isFeatureEntitled(
  user: { planTier?: string | null; orgModules?: string[] | null } | undefined,
  key: string,
): boolean {
  if (!tierAllows((user?.planTier ?? null) as PlanTier | null, key)) return false;
  if (MODULE_KEYS.has(key)) return hasFeatureModule(user ?? {}, key);
  return true; // capability → tier suffices
}

/** Filter a proposed module list down to what the tier actually allows. */
export function capModulesToTier(planTier: string | null | undefined, modules: string[]): string[] {
  return modules.filter((m) => tierAllows((planTier ?? null) as PlanTier | null, m));
}
