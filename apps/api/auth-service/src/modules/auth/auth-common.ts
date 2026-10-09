/**
 * What every part of authentication shares: the result type of the sign-in
 * doors, token hashing, and how a member's permissions are restated on the
 * request context.
 */
import {
  BCRYPT_COST_FACTOR,
  DEFAULT_PROFILE_BADGES,
  buildResolvedAccess,
  accessAllows,
  resolveTaskCreationScope,
  type ProfileBadgesConfig,
} from '@hbcfield/shared';
import { HttpStatus } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';

/*
  A real bcrypt hash of nothing anybody knows, computed ONCE and lazily.

  Compared against when the address is unknown, so a sign-in for an address
  with no account costs the same ~250ms as one for a real account. Lazily so
  the boot does not pay for it; once, so every unknown address shares it.
*/
let dummyHashPromise: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash(randomUUID(), BCRYPT_COST_FACTOR);
  }
  return dummyHashPromise;
}

// Hash a token using SHA-256 for secure storage
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Resolve profile badges: user override > org config > defaults
export function resolveProfileBadges(
  userBadges: any,
  orgBadges: any,
): ProfileBadgesConfig {
  const base = { ...DEFAULT_PROFILE_BADGES };
  // Apply org-level config
  if (orgBadges && typeof orgBadges === 'object') {
    Object.assign(base, orgBadges);
  }
  // Apply user-level override
  if (userBadges && typeof userBadges === 'object') {
    Object.assign(base, userBadges);
  }
  return base;
}

/**
 * Are the legacy per-member permission flags still part of a member's access?
 *
 * Default is yes — the safe answer, because turning them off before every
 * member's role covers them takes capabilities away. Read per call rather than
 * captured at boot so the switch takes effect on the next token validation,
 * without a restart.
 */
/**
 * The legacy permission fields, restated from resolved access.
 *
 * `validateToken` spreads the raw user row, and about seventy-five places
 * downstream read those columns — the gateway forwarding canViewAllTasks to a
 * service, the service then deciding with it. Now that the role is the only
 * source, a column and its own guard can disagree: the guard refuses using the
 * role while the service allows using a column nobody maintains.
 *
 * So the columns stop at this boundary. Every consumer sees what `access`
 * resolved — org-wide only, via accessAllows with no spaceId, because a column
 * on the user row never meant "in this space". Space grants are checked against
 * the resource's own spaceId, which is the only safe way to use them.
 *
 * This is also what makes the columns droppable: afterwards nothing in the
 * request path reads them.
 */
export function orgPermissionFields(
  access: ReturnType<typeof buildResolvedAccess>,
  /*
    The member's own `taskCreationScope` column.

    Every other field here is restated from `access` alone, because a column
    duplicating a permission is a column that can disagree with it. This one
    cannot be derived that way: NONE/SELF/SPACE/ORG is a genuine per-member
    choice about how WIDELY, on top of the permission's WHETHER. So the column
    is passed in and reconciled — see resolveTaskCreationScope, which exists
    because the two did disagree and a space-granted member was refused.
  */
  taskCreationScopeColumn?: string | null,
) {
  return {
    taskCreationScope: resolveTaskCreationScope(taskCreationScopeColumn, access),
    canCreateTasks: accessAllows(access, 'canCreateTasks'),
    canViewAllTasks: accessAllows(access, 'canViewAllTasks'),
    canAssignTasks: accessAllows(access, 'canAssignTasks'),
    canManageUsers: accessAllows(access, 'canManageUsers'),
    canViewReports: accessAllows(access, 'canViewReports'),

    /*
      Split out of the two flags that were carrying the product: canManageUsers
      gated 129 endpoints and canViewAllTasks 81, so "can manage members" also
      meant "can invoice customers and delete assets".

      Each is BRIDGED to the gate it replaces, so this is strictly additive —
      nobody who can do these things today loses them, and an organization can now
      grant either precisely, to a bookkeeper who has no business editing members.
      Drop the `||` half once roles carry the grant.
    */
    canManageInvoices:
      accessAllows(access, 'canManageInvoices') || accessAllows(access, 'canViewAllTasks'),
    /*
      What labour COSTS, as opposed to what it bills at.

      ⚠️ Deliberately NOT bridged to `canManageInvoices`. Raising an invoice is
      an office job — build it, send it, chase it — and the margin is a
      different question asked by a different person. Bundling them lets the
      first bookkeeper hired read the company's margin on every job.

      Bridged to `canManageUsers` instead, which is the grant that already
      carries employment terms: whoever sets somebody's start date and holiday
      entitlement is the person who may reasonably know what their hour costs.
      That also means an owner has it on day one without hunting for a switch.
    */
    canViewLabourCost:
      accessAllows(access, 'canViewLabourCost') || accessAllows(access, 'canManageUsers'),
    canManageAssets:
      accessAllows(access, 'canManageAssets') || accessAllows(access, 'canManageUsers'),
    canManageWorkspaces:
      accessAllows(access, 'canManageWorkspaces') || accessAllows(access, 'canManageUsers'),
    // canManageRota already existed in the catalogue and was required by nothing.
    // The rota endpoints were on canManageUsers, so the key describing exactly
    // that job sat unused while the job was granted by an unrelated one.
    canManageRota:
      accessAllows(access, 'canManageRota') || accessAllows(access, 'canManageUsers'),
    canManagePortals:
      accessAllows(access, 'canManagePortals') || accessAllows(access, 'canManageUsers'),
    canManageTaskTypes:
      accessAllows(access, 'canManageTaskTypes') || accessAllows(access, 'canManageUsers'),
    // Like canManageRota, these three were already in the catalogue and required
    // by nothing, while the job each names was granted by canManageUsers or
    // canViewAllTasks. Wiring them is the fix, not a new concept.
    canReconcileAttendance:
      accessAllows(access, 'canReconcileAttendance') || accessAllows(access, 'canManageUsers'),
    canViewSpaceAttendance:
      accessAllows(access, 'canViewSpaceAttendance') || accessAllows(access, 'canViewAllTasks'),
    canApproveOvertime:
      accessAllows(access, 'canApproveOvertime') ||
      accessAllows(access, 'canManageUsers') ||
      accessAllows(access, 'canViewAllTasks'),
    canViewTracking:
      accessAllows(access, 'canViewTracking') || accessAllows(access, 'canViewAllTasks'),

    /*
      Personnel file — the four document permissions, deliberately with NO `||`
      bridge on any of them.

      Every bridge above exists to preserve access somebody already had when a
      broad flag was split into precise ones. That argument does not apply here:
      documents are a NEW capability, so nobody holds it today and there is
      nothing to preserve. A bridge would therefore not preserve power, it would
      GRANT it — silently handing every holder of `canManageUsers` the ability to
      read their colleagues' payslips on the day this ships.

      The built-in Admin role still receives all four through `allPermissions()`,
      which is honest: the org owner is the employer, and could tick the box for
      themselves in any case. Everyone else — Manager included — is granted
      explicitly, in a UI that already exists, once.
    */
    canViewMemberDocuments: accessAllows(access, 'canViewMemberDocuments'),
    canOpenMemberDocuments: accessAllows(access, 'canOpenMemberDocuments'),
    canIssueDocuments: accessAllows(access, 'canIssueDocuments'),
    canManageDocumentTemplates: accessAllows(access, 'canManageDocumentTemplates'),
    canManageDocumentVisibility: accessAllows(access, 'canManageDocumentVisibility'),
    canReplaceDocuments: accessAllows(access, 'canReplaceDocuments'),
    canDeleteDocuments: accessAllows(access, 'canDeleteDocuments'),
  };
}

export function ignoreLegacyFlags(): boolean {
  return process.env.ACCESS_IGNORE_LEGACY_FLAGS === 'true';
}

/**
 * What the two sign-in doors return.
 *
 * Deliberately ONE type with optional members rather than a discriminated
 * union: every caller and test reads `result.success` first and then the field
 * it expects, and a discriminated union would force a type guard at forty call
 * sites for no behaviour change. The optionality is the honest shape — a
 * failure genuinely has no `data`.
 */
export type AuthResult = {
  success: boolean;
  data?: any;
  statusCode?: HttpStatus;
  message?: string;
  code?: string;
};
