import { orgHasAddOn, hasFeatureModule, AVAILABLE_MODULES, isAddOn } from '@hbcfield/shared';

/** Catalog module keys (switched on per space / per org). Add-ons are NOT here. */
const MODULE_KEYS = new Set<string>(AVAILABLE_MODULES.map((m) => m.key));

/**
 * Single source of truth for "can this org use feature <key>?".
 *
 * Two kinds of thing, two different questions, and neither of them is a tier:
 *
 *   • a MODULE is switched on where it is used and billed there → is it on?
 *   • an ADD-ON is bought once for the organization → is it in what they bought?
 *
 * O(1) against values already on the cached `req.user` — `orgModules` and
 * `orgAddOns`, both resolved server-side by validateToken, neither influenced by
 * the caller. Used by ModuleGuard, the task-field gate and the inline read-gates
 * so enforcement cannot diverge between call sites.
 *
 * Fails closed on anything it does not recognise. A key that is neither a module
 * nor an add-on is a typo or a deleted feature, and the safe answer to both is
 * no — the old version returned `true` for an unknown key, which quietly granted
 * every organization anything spelled wrong.
 */
export function isFeatureEntitled(
  user: { orgModules?: string[] | null; orgAddOns?: string[] | null } | undefined,
  key: string,
): boolean {
  if (MODULE_KEYS.has(key)) return hasFeatureModule(user ?? {}, key);
  if (isAddOn(key)) return orgHasAddOn(user?.orgAddOns, key);
  return false;
}

/**
 * Filter a proposed module list down to the catalogue.
 *
 * There is no tier left to cap against: a space may switch on any module in the
 * catalogue and is billed for what it switched on. What still must not survive
 * is a key that is not a module at all — that would put a line on an invoice
 * nobody can switch off, and grant a feature nobody priced.
 */
export function capModulesToCatalogue(modules: string[]): string[] {
  return modules.filter((m) => MODULE_KEYS.has(m));
}
