import type { PlatformUser } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService, platformCapsFor, isSupportSupervisor, PLATFORM_TOKEN_TTL_SECONDS } from '@hbcfield/shared';
import { publicUser } from './platform-auth-helpers';

/**
 * An operator's session: the token secret, minting a token, the response every
 * session-changing call returns, rotating sessions, and the support scope.
 */
@Injectable()
export class PlatformSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  secret(): string {
    const s = this.config.get<string>('PLATFORM_JWT_SECRET');
    if (!s) throw new Error('PLATFORM_JWT_SECRET not configured');
    return s;
  }

  /**
   * Mint a platform token.
   *
   * `auth_time` is when the password (and code) were last typed; a refresh
   * carries it forward unchanged so a chain of refreshes cannot outlive
   * PLATFORM_SESSION_MAX_SECONDS. Short-lived (PLATFORM_TOKEN_TTL_SECONDS): the
   * console slides it while somebody is working.
   */
  private issueToken(user: { id: string; role: string }, authTime?: number): string {
    const now = Math.floor(Date.now() / 1000);
    return this.jwt.sign(
      { sub: user.id, role: user.role, typ: 'platform', auth_time: authTime ?? now },
      { secret: this.secret(), expiresIn: PLATFORM_TOKEN_TTL_SECONDS },
    );
  }

  /** The response every session-changing call returns: a fresh token + who you are now. */
  async session(user: PlatformUser, authTime?: number) {
    const scope = await this.supportScope(user.id, user.role);
    return {
      token: this.issueToken(user, authTime),
      expiresIn: PLATFORM_TOKEN_TTL_SECONDS,
      user: { ...publicUser(user), ...scope },
      permissions: platformCapsFor(user.role),
    };
  }

  /**
   * End every OTHER session of this operator and hand the caller a fresh one.
   *
   * Used by every change to the second factor: whoever else holds a token for
   * this account — the reason somebody re-keys their authenticator — is out.
   */
  async rotateSessions(userId: string, authTime?: number) {
    const updated = await this.prisma.platformUser.update({
      where: { id: userId },
      data: { tokensValidAfter: new Date() },
    });
    return this.session(updated, authTime);
  }

  /** The caller's support-team scope, resolved for inbox filtering. */
  async supportScope(userId: string, role: string) {
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
}
