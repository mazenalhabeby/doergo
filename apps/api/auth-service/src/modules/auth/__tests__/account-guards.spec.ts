import { validate } from 'class-validator';
import {
  Role,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  mayGrantBaseRole,
  mayTakeOverAccount,
  nextLockStateAfterFailure,
  isLockActive,
  tokenIssuedBeforeCutoff,
  maskEmail,
  normalizeEmail,
  StrongPasswordField,
  PasswordField,
  utf8ByteLength,
} from '@hbcfield/shared';

/*
  The account guards in shared (security/account-guards.ts, validators).

  Each `it` here names the hole it closes, so the test fails on the code that
  had the hole — not merely on a refactor.
*/
describe('account guards', () => {
  describe('mayGrantBaseRole — who may mint an admin', () => {
    it('an admin may grant ADMIN or EMPLOYEE', () => {
      expect(mayGrantBaseRole(Role.ADMIN, Role.ADMIN)).toBe(true);
      expect(mayGrantBaseRole(Role.ADMIN, Role.EMPLOYEE)).toBe(true);
    });
    it('a manager holding canManageUsers may only bring people in as EMPLOYEE', () => {
      expect(mayGrantBaseRole(Role.EMPLOYEE, Role.ADMIN)).toBe(false);
      expect(mayGrantBaseRole(Role.EMPLOYEE, Role.CUSTOMER)).toBe(false);
      expect(mayGrantBaseRole(Role.EMPLOYEE, Role.EMPLOYEE)).toBe(true);
    });
  });

  describe('mayTakeOverAccount — the admin password reset', () => {
    const owner = { id: 'owner', isAdmin: true, perms: {} };
    const admin = { id: 'admin-2', isAdmin: true, perms: {} };
    const manager = { id: 'mgr', isAdmin: false, perms: { canManageUsers: true, canViewAllTasks: true } };
    const lesser = { id: 'emp', isAdmin: false, perms: { canViewAllTasks: true } };
    const wider = { id: 'emp2', isAdmin: false, perms: { canManageUsers: true, canAssignTasks: true } };

    it('nobody but the owner resets the owner — not even another admin', () => {
      expect(mayTakeOverAccount(manager, owner, 'owner')).toEqual({ ok: false, reason: 'OWNER' });
      expect(mayTakeOverAccount(admin, owner, 'owner')).toEqual({ ok: false, reason: 'OWNER' });
    });
    it('a non-admin may not reset an admin', () => {
      expect(mayTakeOverAccount(manager, admin, 'owner')).toEqual({ ok: false, reason: 'ADMIN_TARGET' });
    });
    it('a non-admin may not reset somebody holding permissions they lack', () => {
      expect(mayTakeOverAccount(manager, wider, 'owner')).toEqual({ ok: false, reason: 'EXCEEDS_CEILING' });
    });
    it('a manager may reset somebody within their ceiling; an admin may reset another admin', () => {
      expect(mayTakeOverAccount(manager, lesser, 'owner')).toEqual({ ok: true });
      expect(mayTakeOverAccount(admin, { ...admin, id: 'admin-3' }, 'owner')).toEqual({ ok: true });
    });
  });

  describe('nextLockStateAfterFailure — the lock is a window, not a life sentence', () => {
    const now = new Date('2026-10-09T12:00:00Z');

    it('locks at MAX_FAILED_ATTEMPTS for LOCKOUT_DURATION_MINUTES', () => {
      const next = nextLockStateAfterFailure({ failedLoginAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null }, now);
      expect(next.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS);
      expect(next.lockedUntil!.getTime()).toBe(now.getTime() + LOCKOUT_DURATION_MINUTES * 60_000);
    });

    it('ONE wrong guess after a lock expired does NOT re-lock (it used to, forever)', () => {
      const expired = { failedLoginAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: new Date(now.getTime() - 1000) };
      const next = nextLockStateAfterFailure(expired, now);
      expect(next).toEqual({ failedLoginAttempts: 1, lockedUntil: null });
      expect(isLockActive(next, now)).toBe(false);
    });
  });

  describe('tokenIssuedBeforeCutoff — the session cut-off', () => {
    const cutoff = new Date('2026-10-09T12:00:00.700Z');
    const cutoffSec = Math.floor(cutoff.getTime() / 1000);

    it('refuses a token issued before the cut-off', () => {
      expect(tokenIssuedBeforeCutoff(cutoffSec - 1, cutoff)).toBe(true);
    });
    it('keeps a token minted in the same second (the sign-in right after a reset)', () => {
      expect(tokenIssuedBeforeCutoff(cutoffSec, cutoff)).toBe(false);
    });
    it('no cut-off → nothing refused; a token without iat predates any cut-off', () => {
      expect(tokenIssuedBeforeCutoff(cutoffSec - 99, null)).toBe(false);
      expect(tokenIssuedBeforeCutoff(undefined, cutoff)).toBe(true);
    });
  });

  it('maskEmail keeps the domain and hides the person', () => {
    expect(maskEmail('anna.mueller@example.com')).toBe('a***@example.com');
    expect(maskEmail(null)).toBe('(none)');
  });

  it('normalizeEmail is the one canonical form (trim + lowercase)', () => {
    expect(normalizeEmail('  Mike@Example.COM ')).toBe('mike@example.com');
  });

  describe('passwords and bcrypt’s 72-byte limit', () => {
    class Choose { @StrongPasswordField() password!: string; }
    class SignIn { @PasswordField() password!: string; }

    const make = <T extends object>(C: new () => T, password: string) => Object.assign(new C(), { password });

    it('refuses a chosen password over 72 BYTES — counted in bytes, not letters', async () => {
      const seventyThreeBytes = 'Aa1' + 'x'.repeat(70);
      expect(utf8ByteLength(seventyThreeBytes)).toBe(73);
      expect(await validate(make(Choose, seventyThreeBytes))).not.toHaveLength(0);

      // 40 "ü" are 40 characters but 80 bytes — bcrypt would silently drop 8.
      const umlauts = 'Aa1' + 'ü'.repeat(40);
      expect(await validate(make(Choose, umlauts))).not.toHaveLength(0);

      expect(await validate(make(Choose, 'Aa1' + 'x'.repeat(69)))).toHaveLength(0);
    });

    it('does NOT cap sign-in, so an older, longer password still signs in', async () => {
      expect(await validate(make(SignIn, 'Aa1' + 'x'.repeat(100)))).toHaveLength(0);
    });
  });
});
