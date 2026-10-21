import type { PlatformUser } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@hbcfield/shared';
import {
  PLATFORM_ROLES,
  platformCapsFor,
  isSupportSupervisor,
  type PlatformRole,
  PLATFORM_TOKEN_TTL_SECONDS,
  platformEnrolmentRequired,
} from '@hbcfield/shared';
import { matchTotpStep } from './totp.util';

/**
 * What every operator-account path shares: the token secret, an operator as the
 * console sees them, minting and rotating sessions, a TOTP code, the support
 * scope, a valid role.
 */
@Injectable()
export abstract class PlatformAuthBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly jwt: JwtService,
    protected readonly config: ConfigService,
  ) {}

  protected secret(): string {
    const s = this.config.get<string>('PLATFORM_JWT_SECRET');
    if (!s) throw new Error('PLATFORM_JWT_SECRET not configured');
    return s;
  }
  protected publicUser(u: PlatformUser) {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isActive: u.isActive,
      twoFactorEnabled: u.twoFactorEnabled,
      // Mandatory second factor: until one is enrolled this session reaches
      // /platform/auth/* only (enforced by the gateway's platform guard).
      enrolmentRequired: platformEnrolmentRequired(u),
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }

  /**
   * Mint a platform token.
   *
   * `auth_time` is when the password (and code) were last typed; a refresh
   * carries it forward unchanged so a chain of refreshes cannot outlive
   * PLATFORM_SESSION_MAX_SECONDS. Short-lived (PLATFORM_TOKEN_TTL_SECONDS): the
   * console slides it while somebody is working.
   */
  protected issueToken(user: { id: string; role: string }, authTime?: number): string {
    const now = Math.floor(Date.now() / 1000);
    return this.jwt.sign(
      { sub: user.id, role: user.role, typ: 'platform', auth_time: authTime ?? now },
      { secret: this.secret(), expiresIn: PLATFORM_TOKEN_TTL_SECONDS },
    );
  }

  /** The response every session-changing call returns: a fresh token + who you are now. */
  protected async session(user: PlatformUser, authTime?: number) {
    const scope = await this.supportScope(user.id, user.role);
    return {
      token: this.issueToken(user, authTime),
      expiresIn: PLATFORM_TOKEN_TTL_SECONDS,
      user: { ...this.publicUser(user), ...scope },
      permissions: platformCapsFor(user.role),
    };
  }

  /**
   * End every OTHER session of this operator and hand the caller a fresh one.
   *
   * Used by every change to the second factor: whoever else holds a token for
   * this account — the reason somebody re-keys their authenticator — is out.
   */
  protected async rotateSessions(userId: string, authTime?: number) {
    const updated = await this.prisma.platformUser.update({
      where: { id: userId },
      data: { tokensValidAfter: new Date() },
    });
    return this.session(updated, authTime);
  }

  /**
   * Accept a TOTP code ONCE.
   *
   * The step the code matched is written with a conditional update that only
   * succeeds when it is newer than the last accepted step — so a code (or an
   * older one still inside the ±1 window) cannot be used a second time, and two
   * requests racing with the same code cannot both pass.
   */
  protected async consumeTotp(userId: string, secret: string | null, code: string | undefined): Promise<boolean> {
    const step = matchTotpStep(secret ?? '', code ?? '');
    if (step === null) return false;
    const claimed = await this.prisma.platformUser.updateMany({
      where: { id: userId, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
      data: { twoFactorLastStep: step },
    });
    return claimed.count === 1;
  }

  /** The caller's support-team scope, resolved for inbox filtering. */
  protected async supportScope(userId: string, role: string) {
    const memberships = await this.prisma.supportTeamMember.findMany({
      where: { platformUserId: userId },
      select: { teamId: true, teamRole: true },
    });
    return {
      isSupportSupervisor: isSupportSupervisor(role),
      supportTeamIds: memberships.map((m) => m.teamId),
      supportTeamRoles: memberships.map((m) => ({ teamId: m.teamId, teamRole: m.teamRole })),
    };
  }

  protected validRole(role?: string): PlatformRole | null {
    const r = (role ?? '').toUpperCase();
    return (PLATFORM_ROLES as string[]).includes(r) ? (r as PlatformRole) : null;
  }
}
