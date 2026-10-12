import { scopeFor } from './permission-scope';

/** The three portal keys, weakest first: read requests · answer them · run the portal. */
export type PortalKey = 'canViewPortal' | 'canAnswerPortal' | 'canManagePortals';

/**
 * The workspaces in which the caller holds a portal key — what every portal
 * read and write is narrowed to in the service.
 *
 *   undefined  org-wide (an administrator, or the key held as an org flag —
 *              which includes the bridges in ORG_FLAG_BRIDGES, so whoever ran
 *              portals through `canManagePortals` / `canManageUsers` before the
 *              split keeps exactly what they had)
 *   [ids]      only these workspaces
 *   []         granted nowhere — matches NOTHING
 *
 * ⚠️ `undefined` and `[]` must never collapse into one falsy test; that is how a
 * workspace-scoped answerer would read every portal in the organization.
 *
 * Why the flat flag is asked first and not `spacesGranting` alone: the bridges
 * live on the flat fields only (`access.org` does not spell them out), so
 * `spacesGranting` would narrow an org-wide manager to the workspaces they
 * happen to hold a space role in.
 *
 * ⚠️ A portal with no workspace (`Portal.spaceId` NULL — an organization-level
 * portal) is never inside a list of ids, so it is reachable with the org-wide
 * key only. That is the intended answer, not a side effect.
 */
export function portalScope(user: any, key: PortalKey): string[] | undefined {
  return scopeFor(user, key) ?? undefined;
}
