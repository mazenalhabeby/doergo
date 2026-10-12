import { assetSpaces } from '@hbcfield/shared';

/**
 * The caller of an asset route, as task-service's `AssetAccessService` reads
 * them — built ONCE, from the verified session, and spread AFTER the body so a
 * body field can never say who the caller is or where they may act.
 *
 * Three levels, each a workspace list with three states (`assetSpaces` in
 * shared): `null` = org-wide, `[ids]` = only those workspaces, `[]` =
 * nowhere. `null` travels as null — never folded into `undefined`, which the
 * service reads as NOWHERE, so a route that forgets to forward a level loses
 * access instead of gaining the whole organization's register.
 *
 * ⚠️ Not `taskActor`. Asset reads used to ride on `canViewAllTasks`, so
 * whoever could follow the work could list the organization's equipment, and
 * an outsider given sight of a site was refused assets only by a blanket
 * `@DenyExternal`. The register now has its own three keys; the task grants
 * mean nothing here.
 */
export interface AssetActorPayload {
  userId: string;
  userRole: string;
  organizationId: string;
  isExternal: boolean;
  viewSpaceIds: string[] | null;
  logSpaceIds: string[] | null;
  manageSpaceIds: string[] | null;
  /** Manages assets ORG-WIDE — the backdating exemption and "name another holder". */
  canManageAssets: boolean;
}

export function assetActor(req: { user?: any }): AssetActorPayload {
  const user = req.user ?? {};
  const manage = assetSpaces(user, 'manage');
  return {
    userId: user.id,
    userRole: user.role,
    organizationId: user.organizationId,
    isExternal: user.isExternal === true,
    viewSpaceIds: assetSpaces(user, 'view'),
    logSpaceIds: assetSpaces(user, 'log'),
    manageSpaceIds: manage,
    canManageAssets: manage === null,
  };
}
