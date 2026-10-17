import type { Prisma } from '@prisma/client';
import { REFRESH_TOKEN_GRACE_PERIOD_SECONDS, runWithCronLock, barePushToken } from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SessionEvents } from '../../common/session-events/session-events.service';
import { hashToken } from './auth-common';

/**
 * A member's sessions: signing out, the list of devices, revoking one or all, and
 * the sweep of expired tokens.
 */
@Injectable()
export class SessionControlService {
  private readonly logger = new Logger(SessionControlService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents?: SessionEvents,
  ) {}

  async logout(refreshToken: string, pushToken?: string) {
    try {
      // SECURITY: Hash the token to find and delete
      const tokenHash = hashToken(refreshToken);

      // Look up the owner so we can mark them offline + let the gateway notify
      // teammates in real time.
      const stored = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true, user: { select: { organizationId: true } } },
      });

      await this.prisma.refreshToken.deleteMany({
        where: { tokenHash },
      });

      if (stored?.userId) {
        // Clear last-active so the user reads as offline immediately (no 3-min
        // lag). If they're still active on another device, their next request
        // re-sets it within ~a minute.
        await this.prisma.user
          .update({ where: { id: stored.userId }, data: { lastActiveAt: null } })
          .catch(() => undefined);

        /*
          Signing out stops the pushes to THIS device.

          It used to be the phone's job, through `DELETE /users/push-token/:token`
          issued after the session had already been torn down — best effort, and
          a single failure (no signal at the moment of signing out, the app
          killed mid-logout) orphaned the row permanently, because the phone
          clears its cached token either way and can never name it again. The
          member went on receiving their own notifications on a phone they had
          signed out of, and nothing on either side could stop it.

          ⚠️ Scoped to `userId` as well as the token: `UserPushToken.token` is
          unique, so an unscoped delete would let anyone holding a token string
          unregister somebody else's device.

          ⚠️ THIS DEVICE only, never every token the member has. Signing out of
          one phone must not silence the one still in their pocket.
        */
        // The bare token: phones before the fix sent `token|language` and matched nothing.
        const token = barePushToken(pushToken);
        if (token) {
          await this.prisma.userPushToken
            .deleteMany({ where: { token, userId: stored.userId } })
            .catch(() => undefined);
        }
      }

      return {
        success: true,
        message: 'Logged out successfully',
        userId: stored?.userId,
        organizationId: stored?.user?.organizationId,
      };
    } catch (error) {
      this.logger.error('Logout error:', error);
      return { success: true, message: 'Logged out successfully' };
    }
  }

  /**
   * Clean up expired and used refresh tokens from the database.
   * Runs every 5 minutes to clean up used tokens after grace period.
   */
  /**
   * Cron entry point. The work is in cleanupExpiredTokens(), which stays directly
   * callable — this only decides whether THIS replica is the one to run it.
   */
  @Cron('0 */15 * * * *')
  async cleanupExpiredTokensCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'auth:cleanupExpiredTokens', ttlSeconds: 600, logger: this.logger },
      () => this.cleanupExpiredTokens(),
    );
  }

  async cleanupExpiredTokens() {
    const now = new Date();
    const gracePeriodCutoff = new Date(now.getTime() - REFRESH_TOKEN_GRACE_PERIOD_SECONDS * 1000);

    // Delete expired tokens
    const expiredResult = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    // Delete used tokens past grace period (clear sensitive cached data)
    const usedResult = await this.prisma.refreshToken.deleteMany({
      where: {
        usedAt: { lt: gracePeriodCutoff },
      },
    });

    if (expiredResult.count > 0 || usedResult.count > 0) {
      this.logger.log(`Cleaned up ${expiredResult.count} expired + ${usedResult.count} used refresh tokens`);
    }
    return { success: true, deletedExpired: expiredResult.count, deletedUsed: usedResult.count };
  }

  // ========== SESSION MANAGEMENT ==========

  async listSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
        usedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: sessions };
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        id: sessionId,
        userId, // ensure user can only revoke their own sessions
      },
    });

    if (result.count === 0) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Session not found' };
    }

    return { success: true, data: null, message: 'Session revoked' };
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string, currentRefreshToken?: string) {
    /*
      The session to keep, found from the caller's own refresh token. The
      gateway cannot know its row id (the access token carries no session
      claim), but it holds the token itself — the cookie on the web, the body
      on the phone — and the row is found by its hash, scoped to this user so
      a token belonging to somebody else keeps nothing.
    */
    if (!exceptSessionId && typeof currentRefreshToken === 'string' && currentRefreshToken) {
      const own = await this.prisma.refreshToken.findFirst({
        where: { tokenHash: hashToken(currentRefreshToken), userId },
        select: { id: true },
      });
      exceptSessionId = own?.id;
    }
    const where: Prisma.RefreshTokenWhereInput = { userId };
    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }

    const result = await this.prisma.refreshToken.deleteMany({ where });

    /*
      Signing the OTHER devices out has to reach their access tokens too, or
      each keeps working for up to its full lifetime. There is no per-session
      cut-off, so this one moves the account's: the caller's own access token
      is refused on its next request and silently refreshed from the session
      that was kept — a re-mint the clients already do on any 401.
    */
    if (result.count > 0) {
      await this.prisma.user.update({ where: { id: userId }, data: { tokensValidAfter: new Date() } });
      /*
        "Sign out my other devices" must not close the caller's own live
        connection — the socket event is per PERSON, not per session, so it is
        sent only when no session of theirs was kept. The other devices' sockets
        end at their token expiry, which notification-service enforces.
        A kept id that is not actually theirs keeps nothing, so it emits.
      */
      const keptOwnSession =
        !!exceptSessionId && (await this.prisma.refreshToken.count({ where: { id: exceptSessionId, userId } })) > 0;
      if (!keptOwnSession) this.sessionEvents?.sessionsRevoked(userId);
    }

    return { success: true, data: { revoked: result.count }, message: `${result.count} session(s) revoked` };
  }
}
