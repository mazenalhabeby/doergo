import { isAdmin, type CurrentUserData } from '@hbcfield/shared';

/**
 * What the documents service is told the caller may do.
 *
 * One helper, used by every route, for one reason: `PermissionsGuard` lets an
 * ADMIN through without consulting any flag (`isAdmin(user) → true`), so if the
 * service then re-checked the raw flag it would refuse a request the guard had
 * just allowed. An admin would see a 403 on a route they are plainly entitled
 * to, and it would read as a bug rather than a policy.
 *
 * So the same bypass is applied here, in one place. The alternative — repeating
 * `isAdmin(user) || user.canX` at a dozen call sites — is the version that
 * eventually gets one of them wrong.
 *
 * Note this does NOT widen anything: an admin already receives all four
 * permissions through the built-in Admin role's `allPermissions()`. The bypass
 * only covers legacy admins whose access was never resolved from a role.
 */
export interface DocumentActor {
  userId: string;
  organizationId: string;
  /**
   * Works for a client or partner, not for this organization.
   *
   * Carried because the personnel file is the one area where the answer is not
   * a permission but a relationship: we do not ask somebody else's employee for
   * their papers, and we do not accept them either.
   */
  isExternal: boolean;
  canViewMemberDocuments: boolean;
  canOpenMemberDocuments: boolean;
  canIssueDocuments: boolean;
  canManageDocumentTemplates: boolean;
  /*
    The two facts a document TYPE's visibility is decided from.

    They live here because this is the one function that describes a caller to
    the documents service, and every read already takes it — so no route can
    forget to ask, and there is nowhere else to get the answer wrong.
  */
  /** The member's org-wide role, or null. A type may name the roles that see it. */
  roleId: string | null;
  /** An administrator sees every type — a division of labour, not a wall. */
  isAdmin: boolean;
}

export function documentActor(user: CurrentUserData): DocumentActor {
  const admin = isAdmin(user);
  return {
    userId: user.id,
    // Non-null asserted by the guard chain: every route here is authenticated
    // and onboarding-complete, so a caller without an organization cannot reach
    // it. Coerced rather than asserted so a future public route fails closed
    // on an empty tenant scope instead of matching every row.
    organizationId: user.organizationId ?? '',
    // Not admin-bypassed: this is not a permission an admin outranks, it is who
    // the person works for.
    isExternal: (user as { isExternal?: boolean }).isExternal === true,
    canViewMemberDocuments: admin || !!user.canViewMemberDocuments,
    canOpenMemberDocuments: admin || !!user.canOpenMemberDocuments,
    canIssueDocuments: admin || !!user.canIssueDocuments,
    canManageDocumentTemplates: admin || !!user.canManageDocumentTemplates,
    roleId: user.memberRoleId ?? null,
    isAdmin: admin,
  };
}

/**
 * Where the request came from, for the evidence trail.
 *
 * Read from the request rather than the body: a client that could state its own
 * IP could state someone else's, and an audit trail built from client claims
 * records nothing. The app version is a header because it is not a claim about
 * identity, only about which build produced the call.
 */
export function requestContext(req: {
  ip?: string;
  headers?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
}) {
  const header = (name: string): string | null => {
    const v = req.headers?.[name];
    return typeof v === 'string' ? v.slice(0, 200) : null;
  };
  return {
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: header('user-agent'),
    appVersion: header('x-app-version'),
  };
}
