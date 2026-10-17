import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '@hbcfield/shared';
import { resolveSocketAccess, type SocketAccess } from './socket-access';
import { ChatMembersCache } from './chat-members';
import { ACCESS_TTL_MS, EXPIRY_GRACE_MS, MAX_TIMER_MS, type ClientInfo, type SocketStats } from './gateway.types';
import type { AccessTokenClaims } from './socket-payloads';

/**
 * The gateway's state and the helpers every part of it reads — moved here unchanged
 * from websocket.gateway.ts. The Nest gateway class (websocket.gateway.ts) is the
 * last class in the chain and keeps the decorators and every @SubscribeMessage.
 */
export abstract class GatewayCoreBase {
  abstract server: Server;

  protected readonly logger = new Logger('WebSocketGateway');
  protected connectedClients = new Map<string, ClientInfo>();
  protected startTime = Date.now();
  protected messagesReceived = 0;
  protected messagesSent = 0;
  protected readonly jwtSecret: string;
  // Per-worker throttle for GPS location broadcasts (workerId -> last emit ms).
  protected lastLocationEmit = new Map<string, number>();
  // Pending "mark offline" timers, keyed by userId. When a user's LAST socket
  // drops we wait out a grace window (survives refresh / reconnect / network
  // blips) before flipping them offline. A new authenticate cancels it.
  protected offlineTimers = new Map<string, NodeJS.Timeout>();
  // Grace window before an ungraceful disconnect is treated as "offline".
  protected readonly OFFLINE_GRACE_MS = 60000;
  // Server-side "still here" heartbeat: while a socket is connected the user is
  // online, even if their browser is idle and makes no API calls. We refresh
  // lastActiveAt for all connected users on this interval so an open-but-idle
  // tab never falls out of the 3-minute online window. One query per tick,
  // regardless of how many users are connected.
  protected readonly HEARTBEAT_MS = 60000;
  protected heartbeatTimer?: NodeJS.Timeout;

  // Support live-chat: socket ids of connected human agents (operator staff).
  // Presence = "is any agent online" → drives the customer's live-chat availability.
  protected agentSockets = new Set<string>();
  protected readonly platformJwtSecret?: string;

  /** Conversation members for the typing relay, cached a minute per thread. */
  protected readonly chatMembers = new ChatMembersCache(async (conversationId) =>
    (await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } })).map(
      (m) => m.userId,
    ),
  );

  constructor(
    protected readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
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

  /** True if at least one human support agent socket is connected. */
  protected anyAgentOnline(): boolean {
    return this.agentSockets.size > 0;
  }

  /** True if the user still has at least one authenticated socket connected. */
  protected userHasActiveSocket(userId: string): boolean {
    for (const info of this.connectedClients.values()) {
      if (info.userId === userId) return true;
    }
    return false;
  }

  /**
   * Who raised a ticket — cached briefly, because typing fires per keystroke and
   * a ticket's creator never changes. Bounded so a stream of made-up ids cannot
   * grow it without limit.
   */
  protected ticketCreatorCache = new Map<string, { id: string | null; exp: number }>();
  protected async ticketCreator(ticketId: string): Promise<string | null> {
    const hit = this.ticketCreatorCache.get(ticketId);
    if (hit && hit.exp > Date.now()) return hit.id;
    const t = await this.prisma.supportTicket
      .findUnique({ where: { id: ticketId }, select: { createdById: true } })
      .catch(() => null);
    const id: string | null = t?.createdById ?? null;
    if (this.ticketCreatorCache.size >= 1000) this.ticketCreatorCache.clear();
    this.ticketCreatorCache.set(ticketId, { id, exp: Date.now() + 5 * 60_000 });
    return id;
  }

  /** Is `userId` looking at this conversation on any screen connected here? */
  isViewingConversation(userId: string, conversationId: string): boolean {
    for (const info of this.connectedClients.values()) {
      if (info.userId === userId && info.viewingConversationId === conversationId) return true;
    }
    return false;
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
      const decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as AccessTokenClaims;
      // Only ADMIN can view socket stats (the token carries no fine-grained flags).
      return decoded.role === 'ADMIN';
    } catch {
      return false;
    }
  }

  // =========================================================================
  // FORCE DISCONNECT
  // =========================================================================

  /**
   * Force-disconnect all sockets for a given user — removed from the
   * organization, deactivated, or every session revoked. A HARD disconnect: the
   * client does not auto-reconnect after a server-side disconnect, and if it
   * reloads, its refresh is refused by the auth service.
   */
  forceDisconnectUser(userId: string, reason = 'removed_from_organization') {
    this.disconnectWhere((c) => c.userId === userId, reason, `user ${userId}`);
  }

  /** Every socket of an organization — the operator's off switch. */
  disconnectOrganization(organizationId: string, reason = 'organization_suspended') {
    this.disconnectWhere((c) => c.organizationId === organizationId, reason, `org ${organizationId}`);
  }

  protected disconnectWhere(match: (c: ClientInfo) => boolean, reason: string, label: string) {
    let disconnected = 0;
    for (const [socketId, info] of this.connectedClients) {
      if (!match(info)) continue;
      const socket = this.server?.sockets?.sockets?.get(socketId);
      if (socket) {
        socket.emit('force_disconnect', { reason });
        socket.disconnect(true);
        disconnected++;
      }
      this.connectedClients.delete(socketId);
    }
    if (disconnected > 0) {
      this.logger.log(`[FORCE_DISCONNECT] Disconnected ${disconnected} socket(s) for ${label} (${reason})`);
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
  protected armExpiry(client: Socket, exp: unknown) {
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

  /** The socket's access, re-read from the database once it is a minute old. */
  protected async freshAccess(info: ClientInfo): Promise<SocketAccess | null> {
    if (info.access && info.accessAt && Date.now() - info.accessAt < ACCESS_TTL_MS) return info.access;
    // The token's `iat` rides along so a cut-off moved since authenticate (a
    // password change, "sign out everywhere") also ends this socket's reads.
    const access = await resolveSocketAccess(this.prisma, info.userId, info.organizationId, info.tokenIat);
    if (access) {
      info.access = access;
      info.accessAt = Date.now();
    }
    return access;
  }

  // Get connection statistics
  getStats(): SocketStats {
    const connectionsByRole: Record<string, number> = {};
    const connectionsByOrg: Record<string, number> = {};

    this.connectedClients.forEach((client) => {
      connectionsByRole[client.role] = (connectionsByRole[client.role] || 0) + 1;
      connectionsByOrg[client.organizationId] = (connectionsByOrg[client.organizationId] || 0) + 1;
    });

    return {
      totalConnections: this.server?.sockets?.sockets?.size || 0,
      authenticatedClients: this.connectedClients.size,
      connectionsByRole,
      connectionsByOrg,
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      uptime: Date.now() - this.startTime,
    };
  }

  // Get list of connected clients (for debugging)
  getConnectedClients(): Array<ClientInfo & { socketId: string }> {
    return Array.from(this.connectedClients.entries()).map(([socketId, info]) => ({
      socketId,
      ...info,
    }));
  }
}
