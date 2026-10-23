import { DEFAULT_REFRESH_TOKEN_TTL, PrismaService } from '@hbcfield/shared';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { hashToken } from './auth-common';

/**
 * The token pair a session is made of: the signed access and refresh tokens, the
 * refresh token's hash stored (never the token), and when it expires.
 */
@Injectable()
export class TokenPairService {
  private readonly logger = new Logger(TokenPairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateTokens(
    userId: string,
    email: string,
    role: string,
    organizationId?: string | null,
    deviceInfo?: { userAgent?: string; ipAddress?: string },
    canViewAllTasks = false,
    refreshTtl?: string,
    plat?: string,
  ) {
    // organizationId is embedded so downstream services (e.g. the Socket.IO
    // gateway) can scope rooms from the verified token instead of trusting a
    // client-supplied org id.
    const basePayload: Record<string, unknown> = { sub: userId, email, role };
    if (organizationId) basePayload.organizationId = organizationId;
    // Lets the Socket.IO gateway scope task events to admins + "view all tasks"
    // holders (a room they join) instead of broadcasting to the whole org.
    if (canViewAllTasks) basePayload.canViewAllTasks = true;
    // `plat` = the surface this session was opened from, fixed at login and
    // carried across rotations like `rtl`. Enforcement reads THIS rather than a
    // request header: the claim is signed, so a client cannot drop it to skip
    // the check the way it could simply omit X-Client-Platform.
    if (plat === 'web' || plat === 'mobile') basePayload.plat = plat;

    // Token expiration from environment variables. `refreshTtl` (per-session, from
    // login: web honors rememberMe → 24h/30d; mobile → env default 90d) overrides
    // the env default and is carried forward across rotations via the `rtl` claim.
    const accessExpiration = this.configService.get('JWT_ACCESS_EXPIRATION') || '15m';
    // A duration such as "90d" from the session or the environment.
    const refreshExpiration: string =
      refreshTtl || this.configService.get('JWT_REFRESH_EXPIRATION') || DEFAULT_REFRESH_TOKEN_TTL;

    this.logger.log(`Generating tokens with refreshExpiration=${refreshExpiration}`);

    const accessToken = this.jwtService.sign(
      { ...basePayload, jti: randomUUID() },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiration,
      },
    );

    const refreshToken = this.jwtService.sign(
      // `rtl` = this session's refresh lifetime, so rotation keeps the original
      // policy (web-short vs mobile-90d) instead of resetting to the env default.
      { ...basePayload, jti: randomUUID(), rtl: refreshExpiration },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        // jsonwebtoken types a duration string as its own StringValue.
        expiresIn: refreshExpiration as JwtSignOptions['expiresIn'],
      },
    );

    // Calculate expiry based on config (parse duration string)
    const expiresAt = this.calculateExpiry(refreshExpiration);

    // SECURITY: Store only the hash of the refresh token, not the token itself
    const tokenHash = hashToken(refreshToken);

    const created = await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
        userAgent: deviceInfo?.userAgent?.substring(0, 512),
        ipAddress: deviceInfo?.ipAddress?.substring(0, 45),
      },
    });
    // No part of the hash in the log: a prefix narrows a stolen-database search and
    // says nothing an operator needs — the row id identifies the session.
    this.logger.log(`NEW TOKEN CREATED in DB: id=${created.id}, expires=${expiresAt}`);

    // Return the plain token to the client (they need it to authenticate)
    return { accessToken, refreshToken };
  }

  private calculateExpiry(duration: string): Date {
    const now = new Date();
    const match = duration.match(/^(\d+)([smhd])$/);

    if (!match) {
      // Default to 7 days if invalid format
      now.setDate(now.getDate() + 7);
      return now;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        now.setSeconds(now.getSeconds() + value);
        break;
      case 'm':
        now.setMinutes(now.getMinutes() + value);
        break;
      case 'h':
        now.setHours(now.getHours() + value);
        break;
      case 'd':
        now.setDate(now.getDate() + value);
        break;
    }

    return now;
  }
}
