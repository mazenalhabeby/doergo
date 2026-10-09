/**
 * Account guards — the rules that decide who may take over, grant or lock an
 * account, written ONCE so each door into the product asks the same question.
 *
 * Pure functions, no I/O: the services load the facts (roles, permission sets,
 * the owner id, the lock columns) and ask these. That keeps every rule testable
 * without a database, and keeps two copies from drifting — which is how the
 * join-request approval came to grant ADMIN while the invitation path refused it.
 */
import { Role } from '../types/enums';
import { permissionsExceed, type PermissionSet } from '../types/permissions';
import { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MINUTES } from '../constants/auth';

// =============================================================================
// GRANTING A BASE ROLE
// =============================================================================

/**
 * May somebody holding `granterRole` give another account `targetRole`?
 *
 * An ADMIN may give any staff role. Anybody else — a manager holding
 * `canManageUsers` through a custom role — may only bring people in as
 * EMPLOYEE. Minting an admin is the one act that cannot be delegated by a
 * permission: an admin holds everything by being one, so letting a non-admin
 * create one is letting them create a more powerful account than their own.
 *
 * Shared by invitations (create) and join requests (approve) — the same act
 * reached through two doors.
 */
export function mayGrantBaseRole(granterRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  if (granterRole === Role.ADMIN) return true;
  return targetRole === Role.EMPLOYEE;
}

// =============================================================================
// TAKING OVER AN ACCOUNT (admin password reset)
// =============================================================================

export interface AccountActor {
  id: string;
  isAdmin: boolean;
  /** Effective org-wide permissions (legacy flags ∪ the active org role). */
  perms: PermissionSet;
}

export type AccountTakeoverVerdict =
  | { ok: true }
  | { ok: false; reason: 'OWNER' | 'ADMIN_TARGET' | 'EXCEEDS_CEILING' };

/**
 * May `requester` reset `target`'s password (and so receive a credential that
 * signs in AS them)?
 *
 * A reset that hands back a temporary password is a takeover by design, so it
 * is held to the strictest form of the grant ceiling:
 *   - the organization's OWNER is never reset by somebody else — not even by
 *     another admin. Ownership is the one thing that is not delegable; an admin
 *     who could reset the owner's password could sign in as them and transfer
 *     the organization to themselves.
 *   - a non-admin may not reset an ADMIN.
 *   - a non-admin may not reset anybody whose permissions reach past their own
 *     — otherwise `canManageUsers` becomes "every permission any colleague
 *     holds", one sign-in away.
 */
export function mayTakeOverAccount(
  requester: AccountActor,
  target: AccountActor,
  ownerId: string | null | undefined,
): AccountTakeoverVerdict {
  if (ownerId && target.id === ownerId && requester.id !== ownerId) {
    return { ok: false, reason: 'OWNER' };
  }
  if (requester.isAdmin) return { ok: true };
  if (target.isAdmin) return { ok: false, reason: 'ADMIN_TARGET' };
  if (permissionsExceed(requester.perms, target.perms)) {
    return { ok: false, reason: 'EXCEEDS_CEILING' };
  }
  return { ok: true };
}

// =============================================================================
// SIGN-IN LOCKOUT
// =============================================================================

/**
 * The ONE sentence every refused sign-in gets — unknown address, wrong
 * password, or a locked account. Any difference (a counter, a "locked for N
 * minutes", a 429 instead of a 401) tells a stranger which addresses are real.
 */
export const LOGIN_FAILED_MESSAGE = 'Invalid email or password';

export interface LockState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/** Is the account inside an active lock window right now? */
export function isLockActive(state: Pick<LockState, 'lockedUntil'>, now: Date = new Date()): boolean {
  return !!state.lockedUntil && state.lockedUntil.getTime() > now.getTime();
}

/**
 * The lock columns after one more wrong password.
 *
 * ⚠️ A lock that has EXPIRED starts the count again from zero. Before this the
 * counter was only reset by a successful sign-in, so once an account had been
 * locked a single wrong guess re-locked it — anybody who knew an address could
 * keep its owner out indefinitely with one request every fifteen minutes. Now
 * the attacker needs the full MAX_FAILED_ATTEMPTS again for every window, and
 * the per-IP throttle at the gateway caps how fast they can spend them.
 */
export function nextLockStateAfterFailure(state: LockState, now: Date = new Date()): LockState {
  const lockExpired = !!state.lockedUntil && state.lockedUntil.getTime() <= now.getTime();
  const attempts = (lockExpired ? 0 : state.failedLoginAttempts) + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginAttempts: attempts,
      lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60_000),
    };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null };
}

// =============================================================================
// SESSION CUT-OFF
// =============================================================================

/**
 * Was this access token issued before the account's session cut-off?
 *
 * `iat` is whole SECONDS; the cut-off is a timestamp. Compared at second
 * precision, floor against floor, so a token minted in the same second as the
 * cut-off (the fresh sign-in straight after a password reset) is NOT refused —
 * refusing it would bounce the very person who just reset their password.
 * A token without `iat` is treated as issued at the epoch: it predates any
 * cut-off, which is the safe direction.
 */
export function tokenIssuedBeforeCutoff(
  iatSeconds: number | null | undefined,
  cutoff: Date | null | undefined,
): boolean {
  if (!cutoff) return false;
  const iat = typeof iatSeconds === 'number' ? iatSeconds : 0;
  return iat < Math.floor(cutoff.getTime() / 1000);
}

// =============================================================================
// LOGGING
// =============================================================================

/**
 * An address for a log line: "a***@example.com".
 *
 * Logs are read by more people, kept longer and shipped further than the
 * database — a full address in a lockout line is a list of who is being
 * attacked. The domain stays, because "every lock is on one customer's domain"
 * is the thing an operator needs to see.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(none)';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
