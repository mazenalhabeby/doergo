import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  BCRYPT_COST_FACTOR,
  platformCapsFor,
  normalizeEmail,
  tokenIssuedBeforeCutoff,
  maskEmail,
  nextLockStateAfterFailure,
  platformLogoutCutoff,
  mayRefreshPlatformSession,
} from '@hbcfield/shared';
import { ok, fail } from './platform-auth-helpers';
import { PlatformAuthBase } from './platform-auth.base';

/**
 * Platform-staff authentication + RBAC. Fully isolated from customer auth:
 * tokens are signed with a SEPARATE secret (`PLATFORM_JWT_SECRET`) and carry
 * `typ:'platform'`, so a platform token can never be accepted as a customer
 * token (different key) and vice-versa. bcrypt(12) passwords, per-account
 * lockout after repeated failures, RBAC via the shared permission matrix.
 */
@Injectable()
export class PlatformAuthService extends PlatformAuthBase {

  // ── Login (2FA-aware) ─────────────────────────────────────────────────────────
  async login(data: { email?: string; password?: string; code?: string }) {
    const email = normalizeEmail(data.email ?? '');
    const password = data.password ?? '';
    const invalid = fail('Invalid email or password', 401); // generic → no enumeration
    if (!email || !password) return invalid;

    const user = await this.prisma.platformUser.findUnique({ where: { email } });
    if (!user || !user.isActive) return invalid;
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return fail('Account temporarily locked. Try again later.', 423);

    // Same rule as member sign-in: an EXPIRED lock starts the count again, so
    // one wrong guess after a lock no longer re-locks the account forever.
    const bump = async () => {
      await this.prisma.platformUser.update({ where: { id: user.id }, data: nextLockStateAfterFailure(user) });
    };

    if (!(await bcrypt.compare(password, user.passwordHash))) { await bump(); return invalid; }

    // Second factor.
    if (user.twoFactorEnabled) {
      if (!data.code) return ok({ needs2fa: true }); // password OK → prompt for the code
      if (!(await this.consumeTotp(user.id, user.twoFactorSecret, data.code))) { await bump(); return fail('Invalid authentication code', 401); }
    }

    await this.prisma.platformUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const session = await this.session(user);
    this.logger.log(`[PLATFORM] login: ${maskEmail(user.email)} (${user.role})${session.user.enrolmentRequired ? ' — 2FA enrolment required' : ''}`);
    return ok(session);
  }

  /**
   * Sign out — server side.
   *
   * Moves the operator's session cut-off past the signing-out token, so the
   * token (and every other one this operator holds) is refused from now on.
   * One switch for all of an operator's sessions is deliberate: it is the
   * mechanism password changes already use, and "sign out" on a shared or lost
   * machine should not depend on which tab pressed it.
   */
  async logout(data: { userId: string; iat?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId }, select: { id: true, email: true } });
    if (!user) return fail('Not found', 404);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { tokensValidAfter: platformLogoutCutoff(data.iat) } });
    this.logger.log(`[PLATFORM] logout: ${maskEmail(user.email)}`);
    return ok({ signedOut: true });
  }

  /**
   * Slide a live session forward. The token presented has already been
   * validated by the gateway guard (active, after the cut-off); this only
   * refuses a chain older than PLATFORM_SESSION_MAX_SECONDS.
   */
  async refresh(data: { userId: string; authTime?: number }) {
    if (!mayRefreshPlatformSession(data.authTime)) return fail('Session expired — sign in again', 401);
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user || !user.isActive) return fail('Session expired — sign in again', 401);
    return ok(await this.session(user, data.authTime));
  }

  // ── Self-service: change own password ─────────────────────────────────────────
  async changePassword(data: { userId: string; currentPassword?: string; newPassword?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (!(await bcrypt.compare(data.currentPassword ?? '', user.passwordHash))) return fail('Current password is incorrect', 401);
    if (!data.newPassword || data.newPassword.length < 10) return fail('New password must be at least 10 characters');
    // tokensValidAfter: every operator token already issued — on any machine —
    // stops working now. Changing the password is the answer to "somebody has
    // my session"; a 12-hour token outliving it would make that answer a lie.
    const updated = await this.prisma.platformUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.newPassword, BCRYPT_COST_FACTOR), tokensValidAfter: new Date() } });
    this.logger.log(`[PLATFORM] ${maskEmail(user.email)} changed their password`);
    // Every OTHER session ends; this one continues on a fresh token.
    return ok({ id: user.id, ...(await this.session(updated, data.authTime)) });
  }

  // ── Validate (called by the gateway guard on every request) ───────────────────
  async validateToken(token: string) {
    try {
      const payload = this.jwt.verify(token, { secret: this.secret(), algorithms: ['HS256'] });
      if (payload?.typ !== 'platform' || !payload?.sub) return { valid: false };
      const user = await this.prisma.platformUser.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) return { valid: false };
      // Issued before the operator's last password change/reset → dead.
      if (tokenIssuedBeforeCutoff(payload.iat, user.tokensValidAfter)) return { valid: false };
      const scope = await this.supportScope(user.id, user.role);
      return {
        valid: true,
        user: { ...this.publicUser(user), ...scope },
        permissions: platformCapsFor(user.role),
        // What logout and refresh need about THIS token (not the account).
        session: { iat: payload.iat, authTime: typeof payload.auth_time === 'number' ? payload.auth_time : payload.iat },
      };
    } catch {
      return { valid: false };
    }
  }

  async me(userId: string) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: userId } });
    if (!user) return fail('Not found', 404);
    const scope = await this.supportScope(user.id, user.role);
    return ok({ user: { ...this.publicUser(user), ...scope }, permissions: platformCapsFor(user.role) });
  }
}
