import { sessionAccess } from './stand-in';
import {
  readAssignedHome,
  REFRESH_TOKEN_GRACE_PERIOD_SECONDS,
  normalizeRole,
  runWithCronLock,
  isAdmin,
  isOrganizationSuspended,
  ORG_SUSPENDED_MESSAGE,
  ORG_SUSPENDED_CODE,
  maskEmail,
  memberAccessOf,
  barePushToken,
} from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SessionEvents } from '../../common/session-events/session-events.service';
import { GraceTokenCache } from './grace-token-cache.service';
import {
  hashToken,
  resolveProfileBadges,
  orgPermissionFields,
} from './auth-common';
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
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents?: SessionEvents,
  ) {}

  async refresh(refreshToken: string) {
    try {
      this.logger.log('Refresh attempt started');

      if (!refreshToken) {
        this.logger.warn('Refresh called with empty token');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Refresh token is required',
        };
      }

      // SECURITY: Hash the incoming token to compare with stored hash
      const tokenHash = hashToken(refreshToken);

      // Carry the session's refresh lifetime across rotation. Older tokens issued
      // before this change have no `rtl` claim → undefined → env default (90d).
      let refreshTtl: string | undefined;
      // The surface this session was opened from, carried across rotation the
      // same way. Rotation must not be a route to launder a session onto a
      // platform the member is not allowed to use.
      let sessionPlat: string | undefined;
      try {
        const decoded = this.jwtService.decode(refreshToken) as { rtl?: string; plat?: string } | null;
        if (decoded?.rtl) refreshTtl = decoded.rtl;
        if (decoded?.plat) sessionPlat = decoded.plat;
      } catch {
        /* malformed token is handled by the hash lookup below */
      }

      // Find the stored token by hash
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              organization: { select: { name: true, timezone: true, profileBadges: true, enabledModules: true, subStatus: true, planTier: true, addOns: true, currency: true, offlineMode: true, usesExternalWorkers: true, suspendedAt: true, ownerId: true } },
              /*
                The role and space assignments, because this response REPLACES
                the mobile client's stored user (see `onUserRefreshed`).

                Without them the refresh cannot resolve access, and it was
                answering with raw columns and no `access` at all — so a member
                whose grant comes from a space role was handed their permissions
                at sign-in and lost them at the next token refresh, silently,
                mid-session. Two short indexed reads on a path that already
                loads the user.
              */
              memberRole: { select: { isActive: true, permissions: true } },
              spaceAssignments: {
                select: { spaceId: true, role: { select: { isActive: true, permissions: true } } },
              },
            },
          },
        },
      });

      if (!storedToken) {
        this.logger.warn('Refresh token not found in database');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid refresh token',
        };
      }

      this.logger.log(`Found token for user: ${storedToken.userId}, token ID: ${storedToken.id}`);
      this.logger.log(`Token expires at: ${storedToken.expiresAt}, now: ${new Date()}`);

      if (storedToken.expiresAt < new Date()) {
        this.logger.warn('Refresh token expired');
        // Clean up expired token
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Refresh token expired',
        };
      }

      // The organization was switched off mid-session. Drop the token rather than
      // refusing quietly: a refresh token that keeps being presented every few
      // minutes is a session that has not actually ended.
      if (isOrganizationSuspended(storedToken.user.organization)) {
        this.logger.warn(`[SUSPENDED] Refresh refused for ${maskEmail(storedToken.user.email)} — organization deactivated`);
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: ORG_SUSPENDED_MESSAGE,
          code: ORG_SUSPENDED_CODE,
        };
      }

      // Check if user is still active
      if (!storedToken.user.isActive) {
        this.logger.warn('User account is deactivated');
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Account is deactivated',
        };
      }

      // ========== GRACE PERIOD HANDLING ==========
      // If token was already used, check if we're within the grace period
      if (storedToken.usedAt) {
        const gracePeriodEnd = new Date(storedToken.usedAt.getTime() + REFRESH_TOKEN_GRACE_PERIOD_SECONDS * 1000);
        const now = new Date();

        if (now > gracePeriodEnd) {
          /*
            Beyond grace → a rotated token is being presented again.

            ⚠️ Two very different stories produce this, and the successor tells
            them apart:

            - The successor was never used. The likeliest cause is a phone that
              lost signal between the server rotating its token and the answer
              arriving — normal on a building site, and exactly what offline mode
              makes common. Revoking ALL of this member's sessions for it signed
              them out of every device because one of them lost a response.
              Only THIS chain is ended: this token and its unused successor. The
              member signs in again on this phone; their other devices, and their
              offline queue (kept for the same member), are untouched. A thief
              holding this token is locked out just the same — the successor they
              would need is gone too.

            - The successor WAS used. Two parties hold the chain: treat it as
              theft, revoke every session and record a security event (L9).
          */
          const successor = storedToken.replacedByTokenHash
            ? await this.prisma.refreshToken.findUnique({
                where: { tokenHash: storedToken.replacedByTokenHash },
                select: { id: true, usedAt: true },
              })
            : null;

          if (successor && !successor.usedAt) {
            this.logger.warn(
              `[SECURITY] Stale refresh token for user ${storedToken.userId} whose successor was never used ` +
              `(lost response). Ending this device's session only.`,
            );
            await this.prisma.refreshToken
              .deleteMany({ where: { id: { in: [storedToken.id, successor.id] } } })
              .catch((e) => this.logger.error('Failed to end device session on stale refresh', e));
            return {
              success: false,
              statusCode: HttpStatus.UNAUTHORIZED,
              message: 'Your session on this device ended. Please sign in again.',
              code: 'SESSION_ENDED',
            };
          }

          this.logger.warn(
            `[SECURITY] Refresh-token reuse detected for user ${storedToken.userId} ` +
            `(token used at ${storedToken.usedAt}, successor already used). Revoking every session.`,
          );
          await this.prisma.refreshToken
            .deleteMany({ where: { userId: storedToken.userId } })
            .catch((e) => this.logger.error('Failed to revoke token chain on reuse', e));
          return {
            success: false,
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Token already used',
            code: 'REFRESH_TOKEN_REUSED',
          };
        }

        // Within grace period - check the Redis grace cache or wait for it (H7).
        const graceHit = await this.graceCache.get(storedToken.id);
        if (graceHit) {
          this.logger.log(`Token reuse within grace period (${REFRESH_TOKEN_GRACE_PERIOD_SECONDS}s). Returning cached tokens.`);
          return { success: true, data: graceHit };
        }

        // Within grace period but no cached tokens yet - another request is generating them
        // Wait and retry to get the cached tokens (exponential backoff: 50, 100, 200, 400, 800ms)
        this.logger.log('Token used but cached tokens not ready - waiting for concurrent request to finish');
        for (let attempt = 0; attempt < 5; attempt++) {
          const delay = 50 * Math.pow(2, attempt); // 50, 100, 200, 400, 800ms
          await new Promise(resolve => setTimeout(resolve, delay));

          const graceRetry = await this.graceCache.get(storedToken.id);
          if (graceRetry) {
            this.logger.log(`Got cached tokens from concurrent request (attempt ${attempt + 1}, ${delay}ms)`);
            return { success: true, data: graceRetry };
          }
          this.logger.debug(`Waiting for cached tokens, attempt ${attempt + 1}/5 (${delay}ms)`);
        }

        // After waiting, still no cached tokens - give up
        this.logger.warn('Cached tokens not available after waiting');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Token already used',
        };
      }

      // ========== FIRST USE OF TOKEN ==========
      // Use atomic update to prevent race conditions
      // Only mark as used if usedAt is still null (no other request processed it)
      this.logger.log('First use of token - attempting atomic claim');

      const claimResult = await this.prisma.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          usedAt: null,  // Only update if not already used (atomic check)
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (claimResult.count === 0) {
        // Another request already claimed this token - wait for cached tokens
        this.logger.log('Token was claimed by another request - waiting for cached tokens');

        // Retry with exponential backoff to wait for the other request to finish (50, 100, 200, 400ms)
        for (let attempt = 0; attempt < 4; attempt++) {
          const delay = 50 * Math.pow(2, attempt); // 50, 100, 200, 400ms
          await new Promise(resolve => setTimeout(resolve, delay));

          const graceRetry = await this.graceCache.get(storedToken.id);
          if (graceRetry) {
            this.logger.log(`Returning cached tokens from concurrent request (attempt ${attempt + 1}, ${delay}ms)`);
            return { success: true, data: graceRetry };
          }

          this.logger.debug(`Cached tokens not ready yet, attempt ${attempt + 1}/4 (${delay}ms)`);
        }

        // After retries, still no cached tokens - give up
        this.logger.warn('Token claimed but no cached tokens after retries');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Token already used',
        };
      }

      // We successfully claimed the token - now generate new tokens
      this.logger.log('Token claimed successfully - generating new tokens');

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

      const refreshAccess = await sessionAccess(this.prisma, storedToken.user, storedToken.user.organization?.timezone, memberAccessOf(storedToken.user));

      return {
        success: true,
        data: {
          ...tokens,
          user: {
            id: storedToken.user.id,
            email: storedToken.user.email,
            firstName: storedToken.user.firstName,
            lastName: storedToken.user.lastName,
            role: normalizeRole(storedToken.user.role),
            organizationId: storedToken.user.organizationId,
            onboardingCompleted: storedToken.user.onboardingCompleted,
            isExternal: storedToken.user.isExternal ?? false,
            avatarUrl: storedToken.user.avatarUrl,
            /*
              Permission fields and `access` from the SAME resolution login
              uses, never the raw columns — this response replaces the mobile
              client's user, so anything answered differently here is a
              permission that changes when a token rotates.
            */
            access: refreshAccess,
            ...orgPermissionFields(refreshAccess, storedToken.user.taskCreationScope),
            // See validateToken: a document type may name the roles that see it.
            memberRoleId: storedToken.user.memberRoleId ?? null,
            assignedHome: readAssignedHome(storedToken.user.assignedHome),
            allowRemote: storedToken.user.allowRemote,
            presence: storedToken.user.presence,
            specialty: storedToken.user.specialty,
            profileBadges: resolveProfileBadges(storedToken.user.profileBadges, storedToken.user.organization?.profileBadges),
            enabledModules: (storedToken.user.enabledModules ?? storedToken.user.organization?.enabledModules) || [],
            orgModules: (storedToken.user.organization?.enabledModules as string[] | null) || [],
            spaceModules: await this.tokens.visibleSpaceModules(
              storedToken.user.id,
              storedToken.user.organizationId!,
              isAdmin(storedToken.user as never),
              (storedToken.user.organization?.enabledModules as string[] | null) ?? [],
            ),
            subStatus: storedToken.user.organization?.suspendedAt ? 'canceled' : (storedToken.user.organization?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
            planTier: storedToken.user.organization?.planTier ? storedToken.user.organization.planTier.toString().toLowerCase() : null,
            orgAddOns: storedToken.user.organization?.addOns ?? [],
            orgCurrency: storedToken.user.organization?.currency ?? 'EUR',
            // Refreshed with the session, so switching it reaches a phone within one token lifetime.
            offlineMode: storedToken.user.organization?.offlineMode ?? false,
          },
        },
      };
    } catch (error) {
      this.logger.error('Refresh token error:', error);
      this.logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to refresh token',
      };
    }
  }

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
    const where: any = { userId };
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
        !!exceptSessionId &&
        (await this.prisma.refreshToken.count({ where: { id: exceptSessionId, userId } })) > 0;
      if (!keptOwnSession) this.sessionEvents?.sessionsRevoked(userId);
    }

    return { success: true, data: { revoked: result.count }, message: `${result.count} session(s) revoked` };
  }
}
