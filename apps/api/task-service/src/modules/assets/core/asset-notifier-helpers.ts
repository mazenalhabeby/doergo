
/**
 * Holding any of these, ORG-wide, is what lets somebody open the register —
 * the register's own keys plus the broad keys the org-flag bridges fold into
 * `canViewAssets` (`ORG_FLAG_BRIDGES` in shared).
 */
const SEES_ASSETS = ['canViewAssets', 'canLogAssets', 'canManageAssets', 'canViewAllTasks', 'canManageUsers'] as const;

/**
 * …and in a WORKSPACE, only the register's own keys. Bridges apply org-wide
 * only: `canViewAllTasks` held in a workspace is how somebody follows the work
 * there, and it no longer opens that workspace's equipment — so it must not
 * put the equipment's names in their notifications either.
 */
const SEES_ASSETS_IN_SPACE = ['canViewAssets', 'canLogAssets', 'canManageAssets'] as const;

/** Holding any of these, org-wide, is what lets somebody DECIDE on the register. */

function grants(permissions: unknown, keys: readonly string[]): boolean {
  const p = (permissions ?? {}) as Record<string, unknown>;
  return keys.some((k) => p[k] === true);
}

export { SEES_ASSETS, SEES_ASSETS_IN_SPACE, grants };
