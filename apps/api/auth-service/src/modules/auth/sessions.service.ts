import { sessionAccess } from './stand-in';
import {
  REFRESH_TOKEN_GRACE_PERIOD_SECONDS,
  isAdmin,
  isOrganizationSuspended,
  ORG_SUSPENDED_MESSAGE,
  ORG_SUSPENDED_CODE,
  maskEmail,
  memberAccessOf,
} from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@hbcfield/shared';
import { GraceTokenCache } from './grace-token-cache.service';
import { hashToken } from './auth-common';
import {
  readRotationClaims,
  refuseStaleToken,
  refreshedUser,
  refreshRefusal,
  REFRESH_TOKEN_INCLUDE,
  type RefreshResult,
  type StoredRefreshToken,
} from './refresh-steps';
import { SessionTokensService } from './session-tokens.service';

/**
 * A session over its life: refresh with rotation and a grace period, sign-out,
 * the session list, revoking, and the sweep of spent refresh tokens.
 *
 * Part of authentication; `AuthService` is the facade every caller uses.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly graceCache: GraceTokenCache,
    private readonly tokens: SessionTokensService,
  ) {}

  async refresh(refreshToken: string): Promise<RefreshResult> {
    try {
      this.logger.log('Refresh attempt started');

      if (!refreshToken) {
        this.logger.warn('Refresh called with empty token');
        return refreshRefusal(HttpStatus.UNAUTHORIZED, 'Refresh token is required');
      }

      // SECURITY: Hash the incoming token to compare with stored hash
      const tokenHash = hashToken(refreshToken);
      const { refreshTtl, sessionPlat } = readRotationClaims(this.jwtService, refreshToken);

      // Find the stored token by hash
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: REFRESH_TOKEN_INCLUDE,
      });

      if (!storedToken) {
        this.logger.warn('Refresh token not found in database');
        return refreshRefusal(HttpStatus.UNAUTHORIZED, 'Invalid refresh token');
      }

      this.logger.log(`Found token for user: ${storedToken.userId}, token ID: ${storedToken.id}`);
      this.logger.log(`Token expires at: ${storedToken.expiresAt}, now: ${new Date()}`);

      const unusable = await this.refuseUnusableToken(storedToken);
      if (unusable) return unusable;

      // ========== GRACE PERIOD HANDLING ==========
      // If token was already used, check if we're within the grace period
      if (storedToken.usedAt) return await this.refreshUsedToken(storedToken, storedToken.usedAt);

      // ========== FIRST USE OF TOKEN ==========
      // Use atomic update to prevent race conditions
      // Only mark as used if usedAt is still null (no other request processed it)
      this.logger.log('First use of token - attempting atomic claim');

      const claimResult = await this.prisma.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          usedAt: null, // Only update if not already used (atomic check)
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (claimResult.count === 0) {
        // Another request already claimed this token - wait for cached tokens
        this.logger.log('Token was claimed by another request - waiting for cached tokens');

        // Retry with exponential backoff to wait for the other request to finish (50, 100, 200, 400ms)
        const cached = await this.waitForGraceTokens(
          storedToken.id,
          4,
          'Returning cached tokens from concurrent request',
          'Cached tokens not ready yet',
        );
        if (cached) return cached;

        // After retries, still no cached tokens - give up
        this.logger.warn('Token claimed but no cached tokens after retries');
        return refreshRefusal(HttpStatus.UNAUTHORIZED, 'Token already used');
      }

      // We successfully claimed the token - now generate new tokens
      this.logger.log('Token claimed successfully - generating new tokens');
      const tokens = await this.rotate(storedToken, refreshTtl, sessionPlat);

      const user = storedToken.user;
      const refreshAccess = await sessionAccess(this.prisma, user, user.organization?.timezone, memberAccessOf(user));
      const spaceModules = await this.tokens.visibleSpaceModules(
        user.id,
        user.organizationId!,
        isAdmin(user as never),
        (user.organization?.enabledModules as string[] | null) ?? [],
      );

      return {
        success: true,
        data: {
          ...tokens,
          user: refreshedUser(user, refreshAccess, spaceModules),
        },
      };
    } catch (error) {
      this.logger.error('Refresh token error:', error);
      this.logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      return refreshRefusal(HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to refresh token');
    }
  }

  /** Expired, organization switched off, or account deactivated — the token is dropped. Null = usable. */
  private async refuseUnusableToken(storedToken: StoredRefreshToken) {
    if (storedToken.expiresAt < new Date()) {
      this.logger.warn('Refresh token expired');
      // Clean up expired token
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      return refreshRefusal(HttpStatus.UNAUTHORIZED, 'Refresh token expired');
    }

    // The organization was switched off mid-session. Drop the token rather than
    // refusing quietly: a refresh token that keeps being presented every few
    // minutes is a session that has not actually ended.
    if (isOrganizationSuspended(storedToken.user.organization)) {
      this.logger.warn(
        `[SUSPENDED] Refresh refused for ${maskEmail(storedToken.user.email)} — organization deactivated`,
      );
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      return refreshRefusal(HttpStatus.FORBIDDEN, ORG_SUSPENDED_MESSAGE, ORG_SUSPENDED_CODE);
    }

    // Check if user is still active
    if (!storedToken.user.isActive) {
      this.logger.warn('User account is deactivated');
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      return refreshRefusal(HttpStatus.UNAUTHORIZED, 'Account is deactivated');
    }
    return null;
  }

  /** A token already used: within grace → the same rotated pair; beyond it → reuse handling. */
  private async refreshUsedToken(storedToken: StoredRefreshToken, usedAt: Date) {
    const gracePeriodEnd = new Date(usedAt.getTime() + REFRESH_TOKEN_GRACE_PERIOD_SECONDS * 1000);
    const now = new Date();

    if (now > gracePeriodEnd) return refuseStaleToken(this.prisma, this.logger, storedToken);

    // Within grace period - check the Redis grace cache or wait for it (H7).
    const graceHit = await this.graceCache.get(storedToken.id);
    if (graceHit) {
      this.logger.log(
        `Token reuse within grace period (${REFRESH_TOKEN_GRACE_PERIOD_SECONDS}s). Returning cached tokens.`,
      );
      return { success: true, data: graceHit };
    }

    // Within grace period but no cached tokens yet - another request is generating them
    // Wait and retry to get the cached tokens (exponential backoff: 50, 100, 200, 400, 800ms)
    this.logger.log('Token used but cached tokens not ready - waiting for concurrent request to finish');
    const cached = await this.waitForGraceTokens(
      storedToken.id,
      5,
      'Got cached tokens from concurrent request',
      'Waiting for cached tokens',
    );
    if (cached) return cached;

    // After waiting, still no cached tokens - give up
    this.logger.warn('Cached tokens not available after waiting');
    return refreshRefusal(HttpStatus.UNAUTHORIZED, 'Token already used');
  }

  /** Wait for a concurrent refresh to publish its pair: 50ms, doubling, `attempts` times. */
  private async waitForGraceTokens(tokenId: string, attempts: number, hitLog: string, waitLog: string) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const delay = 50 * Math.pow(2, attempt); // 50, 100, 200, 400(, 800)ms
      await new Promise((resolve) => setTimeout(resolve, delay));

      const graceRetry = await this.graceCache.get(tokenId);
      if (graceRetry) {
        this.logger.log(`${hitLog} (attempt ${attempt + 1}, ${delay}ms)`);
        return { success: true, data: graceRetry };
      }
      this.logger.debug(`${waitLog}, attempt ${attempt + 1}/${attempts} (${delay}ms)`);
    }
    return null;
  }

  /** The claimed token's successor: minted, published to the grace cache, recorded for reuse detection. */
  private async rotate(
    storedToken: StoredRefreshToken,
    refreshTtl: string | undefined,
    sessionPlat: string | undefined,
  ) {
    const tokens = await this.tokens.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role,
      storedToken.user.organizationId,
      undefined,
      storedToken.user.canViewAllTasks,
      refreshTtl,
      // Carried forward, not re-declared: rotation must not be a way to
      // launder a session onto a surface the member may not use.
      sessionPlat,
    );

    // Find the new refresh token hash (it was just created by generateTokens)
    const newRefreshTokenHash = hashToken(tokens.refreshToken);

    // Publish the rotated pair to the Redis grace cache (TTL = grace window) so
    // concurrent refreshes within the window get the SAME new tokens — instead
    // of persisting them in the clear in the DB for up to ~15 min. (H7)
    await this.graceCache.put(storedToken.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    // Record the replacement hash for reuse-detection (stays in the DB).
    // Use updateMany to avoid throwing if the record was somehow deleted.
    const updateResult = await this.prisma.refreshToken.updateMany({
      where: { id: storedToken.id },
      data: {
        replacedByTokenHash: newRefreshTokenHash,
      },
    });

    if (updateResult.count === 0) {
      // Token was deleted between claim and update - this shouldn't happen
      // But we already created the new token, so just return success
      this.logger.warn('Token record disappeared after claim - but new tokens were created, returning success');
    } else {
      this.logger.log('Refresh successful - token marked as used with grace period');

      // Old token cleanup is handled durably by the cleanupExpiredTokens cron
      // (deletes used tokens past the grace window). An in-process setTimeout
      // was previously used but is lost on restart/crash, orphaning rows.
    }
    return tokens;
  }
}
