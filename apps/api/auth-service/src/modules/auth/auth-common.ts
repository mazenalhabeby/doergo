/**
 * What every part of authentication shares: the result type of the sign-in
 * doors, token hashing, and how a member's permissions are restated on the
 * request context.
 */
import {
  BCRYPT_COST_FACTOR,
  DEFAULT_PROFILE_BADGES,
  buildResolvedAccess,
  orgFlagFields,
  resolveTaskCreationScope,
  type ProfileBadgesConfig,
  hashCode,
} from '@hbcfield/shared';
import { HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
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

// Hash a token using SHA-256 for secure storage (the same digest as invitation codes)
export const hashToken = hashCode;

// Resolve profile badges: user override > org config > defaults
export function resolveProfileBadges(userBadges: unknown, orgBadges: unknown): ProfileBadgesConfig {
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
    /*
      Every permission key, as an org-wide boolean, with the bridges that keep a
      grant split out of a broader one (ORG_FLAG_BRIDGES in shared — the reasons
      for each bridge, and for documents having none, live there).
    */
    ...orgFlagFields(access),
  };
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
