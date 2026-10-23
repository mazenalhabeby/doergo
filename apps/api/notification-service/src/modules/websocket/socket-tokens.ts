import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { EXPIRY_GRACE_MS, MAX_TIMER_MS } from './gateway.types';
import type { AccessTokenClaims } from './socket-payloads';

/**
 * The secrets sockets are verified with, and what a token's lifetime means for a live
 * socket: an app access token, a platform-staff (console) token, the stats endpoints'
 * bearer, and the cut when a token lapses.
 */
@Injectable()
export class SocketTokens {
  private readonly logger = new Logger('WebSocketGateway');
  private readonly jwtSecret: string;
  private readonly platformJwtSecret?: string;

  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('CRITICAL: JWT_ACCESS_SECRET must be configured for socket authentication');
    }
    this.jwtSecret = secret;
    // Agent sockets authenticate with a platform-staff JWT (admin.hbcfield.com)
    // holding manageSupport — and nothing else. The static platform key no
    // longer opens one (its only user, the web app's /operator/support page,
    // was removed).
    this.platformJwtSecret = configService.get<string>('PLATFORM_JWT_SECRET');
  }

  /**
   * An app access token's claims; throws when it is invalid or expired. Pin the
   * algorithm so a token can't force verification under a different scheme
   * (none-alg / RS↔HS confusion) — defense-in-depth (L10).
   */
  verifyAccessToken(token: string): AccessTokenClaims {
    return jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as AccessTokenClaims;
  }

  /** Is a platform-staff secret configured at all? Without one no agent socket opens. */
  get acceptsPlatformTokens(): boolean {
    return !!this.platformJwtSecret;
  }

  /** A platform-staff token's claims, or null when it does not verify. */
  verifyPlatformToken(token: string): (AccessTokenClaims & { typ?: unknown }) | null {
    if (!this.platformJwtSecret) return null;
    try {
      return jwt.verify(token, this.platformJwtSecret, { algorithms: ['HS256'] }) as AccessTokenClaims & {
        typ?: unknown;
      };
    } catch {
      return null; // invalid token
    }
  }

  // =========================================================================
  // AUTH CHECK FOR STATS ENDPOINTS
  // =========================================================================

  /**
   * Verify a stats request token. Returns true if authorized.
   * Used by the notification controller to gate stats/clients endpoints.
   */
  verifyStatsAccess(authHeader: string | undefined): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }
    const token = authHeader.slice(7);
    try {
      const decoded = this.verifyAccessToken(token);
      // Only ADMIN can view socket stats (the token carries no fine-grained flags).
      return decoded.role === 'ADMIN';
    } catch {
      return false;
    }
  }

  /**
   * Arm the token-expiry cut for one socket.
   *
   * The CHEAP option: one timer per authenticated socket (cleared on disconnect)
   * rather than a periodic sweep over every client. It cycles the TRANSPORT
   * (`conn.close()`), not the socket: the client sees a transport close, which
   * socket.io reconnects from on its own, and both clients pass their CURRENT
   * token on every reconnect (the `auth` callback) and re-authenticate on
   * `connect`. A session that has since been revoked has no current token, so
   * it does not come back. A server-side `disconnect(true)` here would have
   * stopped realtime for every user every access-token lifetime.
   */
  armExpiry(client: Socket, exp: unknown) {
    const holder = client as unknown as { __expiryTimer?: NodeJS.Timeout };
    clearTimeout(holder.__expiryTimer);
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return;
    const wait = exp * 1000 + EXPIRY_GRACE_MS - Date.now();
    holder.__expiryTimer = setTimeout(
      () => {
        if (wait > MAX_TIMER_MS) return this.armExpiry(client, exp); // still far off: re-arm
        this.logger.log(`[AUTH] Token expired on ${client.id} — cycling transport for re-authentication`);
        // Out of every room at once; the disconnect that follows cleans up the rest.
        for (const room of client.rooms) if (room !== client.id) client.leave(room);
        client.emit('session_expired', { reason: 'token_expired' });
        if (client.conn && typeof client.conn.close === 'function') client.conn.close();
        else client.disconnect(true);
      },
      Math.max(0, Math.min(wait, MAX_TIMER_MS)),
    );
    holder.__expiryTimer.unref?.();
  }
}
