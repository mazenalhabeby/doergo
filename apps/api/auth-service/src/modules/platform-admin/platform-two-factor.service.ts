import { Injectable } from '@nestjs/common';
import { maskEmail } from '@hbcfield/shared';
import { generateBase32Secret, matchTotpStep, otpauthUri } from './totp.util';
import { ok, fail } from './platform-auth-helpers';
import { PlatformAuthBase } from './platform-auth.base';

/**
 * An operator's second factor: setting it up, switching it on and off, and an
 * owner resetting somebody's.
 */
@Injectable()
export class PlatformTwoFactorService extends PlatformAuthBase {

  // ── Self-service: 2FA (TOTP) ──────────────────────────────────────────────────
  /**
   * Start enrolling an authenticator.
   *
   * The new secret is held as PENDING: the factor in force is untouched until a
   * code from the new one is verified (enable2fa). It used to be written
   * straight over the active secret with `twoFactorEnabled: false` — so anybody
   * holding a session (a stolen token, an unlocked laptop) could strip 2FA with
   * one request and no proof.
   *
   * While 2FA is ON, re-keying needs a CURRENT code: possession of the old
   * factor is what authorises replacing it.
   */
  async setup2fa(data: { userId: string; code?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (user.twoFactorEnabled) {
      if (!data.code) return { ...fail('Enter a current code from your authenticator to replace it', 400), code: 'PLATFORM_2FA_CODE_REQUIRED' };
      if (!(await this.consumeTotp(user.id, user.twoFactorSecret, data.code))) return fail('Invalid code', 400);
    }
    const secret = generateBase32Secret();
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorPendingSecret: secret } });
    this.logger.warn(`[PLATFORM] ${maskEmail(user.email)} started 2FA enrolment`);
    const session = await this.rotateSessions(user.id, data.authTime);
    return ok({ secret, otpauthUri: otpauthUri(user.email, secret), ...session });
  }

  /**
   * Confirm a code from the PENDING secret → it becomes the factor in force.
   *
   * The step check is against the new secret, whose codes have never been
   * used, and the write is conditional on the pending secret still being the
   * one verified — two racing confirmations cannot swap in different secrets.
   */
  async enable2fa(data: { userId: string; code?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user || !user.twoFactorPendingSecret) return fail('Start 2FA setup first', 400);
    const pending = user.twoFactorPendingSecret;
    const step = matchTotpStep(pending, data.code ?? '');
    if (step === null) return fail('Invalid code', 400);
    const claimed = await this.prisma.platformUser.updateMany({
      where: { id: user.id, twoFactorPendingSecret: pending },
      data: { twoFactorSecret: pending, twoFactorPendingSecret: null, twoFactorEnabled: true, twoFactorLastStep: step },
    });
    if (claimed.count !== 1) return fail('Start 2FA setup first', 409);
    this.logger.warn(`[PLATFORM] ${maskEmail(user.email)} enabled 2FA`);
    return ok({ twoFactorEnabled: true, ...(await this.rotateSessions(user.id, data.authTime)) });
  }

  /**
   * Turn 2FA off — requires a current code (proves possession).
   *
   * Every platform role must hold a second factor, so this does not free the
   * account: the session it returns is limited to enrolling a new one.
   */
  async disable2fa(data: { userId: string; code?: string; authTime?: number }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.userId } });
    if (!user) return fail('Not found', 404);
    if (!user.twoFactorEnabled) return fail('Two-factor authentication is not on', 400);
    if (!(await this.consumeTotp(user.id, user.twoFactorSecret, data.code))) return fail('Invalid code', 400);
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorPendingSecret: null } });
    this.logger.warn(`[PLATFORM] ${maskEmail(user.email)} disabled 2FA`);
    return ok({ twoFactorEnabled: false, ...(await this.rotateSessions(user.id, data.authTime)) });
  }

  /**
   * An Owner clears somebody else's second factor (a lost phone).
   *
   * Never one's own — that would be a way round needing a code to disable it.
   * Ends every session of that operator; their next sign-in is enrolment-only.
   */
  async reset2fa(data: { id: string; byUserId?: string }) {
    if (!data.byUserId || data.id === data.byUserId) return fail('Use Security → Disable 2FA for your own account', 400);
    const user = await this.prisma.platformUser.findUnique({ where: { id: data.id }, select: { id: true, email: true } });
    if (!user) return fail('Not found', 404);
    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorPendingSecret: null, twoFactorLastStep: null, tokensValidAfter: new Date() },
    });
    this.logger.warn(`[PLATFORM] 2FA reset for ${maskEmail(user.email)} by ${data.byUserId}`);
    return ok({ id: user.id, twoFactorEnabled: false });
  }
}
