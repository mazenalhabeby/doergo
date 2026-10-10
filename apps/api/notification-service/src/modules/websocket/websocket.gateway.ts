import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { instrument } from '@socket.io/admin-ui';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SocketEvents, PrismaService, platformCan, safeEqual } from '@hbcfield/shared';
import { operatorMaySupport, recordStaticKeyAgentSocket, resolveSocketAccess, socketMayOpenTask, type SocketAccess } from './socket-access';

export interface ClientInfo {
  userId: string;
  role: string;
  organizationId: string;
  connectedAt: Date;
  rooms: string[];
  /** Access resolved from the database (not the token's claims) and when. */
  access?: SocketAccess;
  accessAt?: number;
  /** The token's `iat` (seconds), checked against the account's session cut-off on every re-read. */
  tokenIat?: number;
}

/**
 * Revocation events this gateway listens for (notification.controller.ts).
 * Emitted by the auth service; the names are a contract — change both sides.
 *
 *   'user_removed'            { userId, organizationId }  removed from the org
 *   'user_sessions_revoked'   { userId }                  deactivated / signed out everywhere / password reset
 *   'organization_suspended'  { organizationId }          the operator's off switch
 *
 * A socket authenticates ONCE; without these it would keep receiving the
 * organization's live events until it happened to drop.
 */
export const SOCKET_REVOCATION_EVENTS = {
  USER_REMOVED: 'user_removed',
  USER_SESSIONS_REVOKED: 'user_sessions_revoked',
  ORGANIZATION_SUSPENDED: 'organization_suspended',
} as const;

/** How long a resolved access is trusted on a socket before a task join re-reads it. */
const ACCESS_TTL_MS = 60_000;
/**
 * Grace after the token's `exp` before the transport is cycled — time for the
 * client's own refresh to land, so the reconnect presents the NEW token.
 */
const EXPIRY_GRACE_MS = 30_000;
/** setTimeout's ceiling (~24.8 days); a longer wait is re-armed when it fires. */
const MAX_TIMER_MS = 2_147_483_647;

export interface SocketStats {
  totalConnections: number;
  authenticatedClients: number;
  connectionsByRole: Record<string, number>;
  connectionsByOrg: Record<string, number>;
  messagesReceived: number;
  messagesSent: number;
  uptime: number;
}

@WebSocketGateway({
  cors: {
    origin: (process.env.SOCKET_CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,https://admin.socket.io').split(','),
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('WebSocketGateway');
  private connectedClients = new Map<string, ClientInfo>();
  private startTime = Date.now();
  private messagesReceived = 0;
  private messagesSent = 0;
  private readonly jwtSecret: string;
  // Per-worker throttle for GPS location broadcasts (workerId -> last emit ms).
  private lastLocationEmit = new Map<string, number>();
  // Pending "mark offline" timers, keyed by userId. When a user's LAST socket
  // drops we wait out a grace window (survives refresh / reconnect / network
  // blips) before flipping them offline. A new authenticate cancels it.
  private offlineTimers = new Map<string, NodeJS.Timeout>();
  // Grace window before an ungraceful disconnect is treated as "offline".
  private readonly OFFLINE_GRACE_MS = 60000;
  // Server-side "still here" heartbeat: while a socket is connected the user is
  // online, even if their browser is idle and makes no API calls. We refresh
  // lastActiveAt for all connected users on this interval so an open-but-idle
  // tab never falls out of the 3-minute online window. One query per tick,
  // regardless of how many users are connected.
  private readonly HEARTBEAT_MS = 60000;
  private heartbeatTimer?: NodeJS.Timeout;

  // Support live-chat: socket ids of connected human agents (operator staff).
  // Presence = "is any agent online" → drives the customer's live-chat availability.
  private agentSockets = new Set<string>();
  private readonly platformAdminKey?: string;
  private readonly platformJwtSecret?: string;

  constructor(private readonly prisma: PrismaService, configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('CRITICAL: JWT_ACCESS_SECRET must be configured for socket authentication');
    }
    this.jwtSecret = secret;
    // Agent sockets authenticate with EITHER the legacy platform key (operator
    // console) OR a platform-staff JWT (admin.hbcfield.com) with manageSupport.
    this.platformAdminKey = configService.get<string>('PLATFORM_ADMIN_KEY');
    this.platformJwtSecret = configService.get<string>('PLATFORM_JWT_SECRET');
  }

  /** True if at least one human support agent socket is connected. */
  private anyAgentOnline(): boolean {
    return this.agentSockets.size > 0;
  }

  /** True if the user still has at least one authenticated socket connected. */
  private userHasActiveSocket(userId: string): boolean {
    for (const info of this.connectedClients.values()) {
      if (info.userId === userId) return true;
    }
    return false;
  }

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway initialized');

    // Socket.IO Admin UI (https://admin.socket.io) — FAIL CLOSED: in production it
    // is only enabled when a non-empty SOCKET_ADMIN_PASSWORD is set, otherwise it
    // stays off (an unauthenticated Admin UI can inspect every socket and emit
    // arbitrary events).
    const isProduction = process.env.NODE_ENV === 'production';
    const adminPassword = process.env.SOCKET_ADMIN_PASSWORD;
    if (isProduction && !adminPassword) {
      this.logger.warn('Socket.IO Admin UI DISABLED — set SOCKET_ADMIN_PASSWORD to enable it in production.');
    } else {
      instrument(server, {
        auth: isProduction
          ? { type: 'basic', username: process.env.SOCKET_ADMIN_USER || 'admin', password: adminPassword as string }
          : false,
        mode: isProduction ? 'production' : 'development',
      });
      this.logger.log('Socket.IO Admin UI enabled at https://admin.socket.io');
    }

    // Per-socket message counters. NOTE: we deliberately do NOT stringify the
    // payload here — that ran on every inbound/outbound event and was pure CPU
    // waste. Event names only.
    server.use((socket, next) => {
      socket.onAny((event) => {
        this.messagesReceived++;
        this.logger.debug(`[RECV] ${socket.id} -> ${event}`);
      });
      socket.onAnyOutgoing((event) => {
        if (event !== 'disconnect') {
          this.messagesSent++;
          this.logger.debug(`[SEND] ${socket.id} <- ${event}`);
        }
      });
      next();
    });

    // Keep connected users "online" while their tab is open (see HEARTBEAT_MS).
    this.heartbeatTimer = setInterval(() => {
      void this.refreshConnectedPresence();
    }, this.HEARTBEAT_MS);
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const timer of this.offlineTimers.values()) clearTimeout(timer);
    this.offlineTimers.clear();
  }

  /** Bump lastActiveAt for every currently-connected user in one query. */
  private async refreshConnectedPresence() {
    const userIds = new Set<string>();
    for (const info of this.connectedClients.values()) userIds.add(info.userId);
    if (userIds.size === 0) return;

    await this.prisma.user
      .updateMany({
        where: { id: { in: Array.from(userIds) } },
        data: { lastActiveAt: new Date() },
      })
      .catch((err) => this.logger.warn(`[PRESENCE] heartbeat failed: ${err}`));
  }

  handleConnection(client: Socket) {
    const clientIp = client.handshake.address;
    const userAgent = client.handshake.headers['user-agent'] || 'unknown';

    this.logger.log(`[CONNECT] Client ${client.id} from ${clientIp}`);
    this.logger.debug(`[CONNECT] User-Agent: ${userAgent.substring(0, 100)}`);

    // Send connection acknowledgment
    client.emit('connected', {
      socketId: client.id,
      timestamp: new Date().toISOString(),
      message: 'Connected to notification service',
    });

    // Reject sockets that never authenticate: disconnect after 15s if they
    // haven't sent a valid `authenticate` by then. Stops unauthenticated
    // connections from piling up (cheap resource exhaustion).
    (client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer = setTimeout(() => {
      if (!this.connectedClients.has(client.id)) {
        this.logger.warn(`[AUTH] Disconnecting ${client.id}: not authenticated within 15s`);
        client.disconnect(true);
      }
    }, 15000);
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);

    if (clientInfo) {
      this.logger.log(`[DISCONNECT] Client ${client.id} (user: ${clientInfo.userId}, role: ${clientInfo.role})`);
    } else {
      this.logger.log(`[DISCONNECT] Client ${client.id} (unauthenticated)`);
    }

    clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);
    clearTimeout((client as unknown as { __expiryTimer?: NodeJS.Timeout }).__expiryTimer);

    // Clean up event listeners to prevent memory leaks
    client.offAny();
    client.offAnyOutgoing();

    this.connectedClients.delete(client.id);

    // Support agent presence: if this was an agent socket and the last one, tell
    // customers live chat just went offline.
    if (this.agentSockets.delete(client.id) && !this.anyAgentOnline()) {
      this.server.emit(SocketEvents.SUPPORT_AGENT_PRESENCE, { online: false });
    }

    // Real-time offline: if this was the user's LAST socket, start a grace timer.
    // If they don't reconnect within the window AND they aren't on the clock,
    // clear lastActiveAt + broadcast offline so teammates' dashboards move them
    // to "Off Duty" immediately (instead of waiting out the 3-min stale window).
    if (clientInfo && !this.userHasActiveSocket(clientInfo.userId)) {
      this.scheduleOfflineCheck(clientInfo.userId, clientInfo.organizationId);
    }
  }

  private scheduleOfflineCheck(userId: string, organizationId: string) {
    const existing = this.offlineTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      void this.markOfflineIfIdle(userId, organizationId);
    }, this.OFFLINE_GRACE_MS);

    this.offlineTimers.set(userId, timer);
  }

  private async markOnline(userId: string, organizationId: string, wasOffline: boolean) {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
        select: { presence: true },
      });

      // Only broadcast on a real offline→online transition, so opening a second
      // tab or a socket reconnect doesn't spam every dashboard with refetches.
      if (wasOffline) {
        this.emitPresenceChanged(userId, updated.presence ?? 'AVAILABLE', organizationId);
      }
    } catch (err) {
      this.logger.warn(`[PRESENCE] online mark failed for user ${userId}: ${err}`);
    }
  }

  private async markOfflineIfIdle(userId: string, organizationId: string) {
    // Reconnected during the grace window? Leave them online.
    if (this.userHasActiveSocket(userId)) return;

    try {
      // Clocked-in guard: a technician driving or working on-site with the app
      // backgrounded is still "at work" — never mark them offline. Their clock-in
      // (a DB record) is untouched regardless.
      const openEntry = await this.prisma.timeEntry.findFirst({
        where: { userId, status: 'CLOCKED_IN' },
        select: { id: true },
      });
      if (openEntry) return;

      // Genuinely gone: clear last-active so they compute as offline, then push.
      await this.prisma.user
        .update({ where: { id: userId }, data: { lastActiveAt: null } })
        .catch(() => undefined);

      this.emitPresenceChanged(userId, null, organizationId);
    } catch (err) {
      this.logger.warn(`[PRESENCE] offline check failed for user ${userId}: ${err}`);
    }
  }

  @SubscribeMessage('authenticate')
  async handleAuthenticate(client: Socket, payload: { userId: string; role: string; organizationId: string }) {
    // Extract token from socket handshake auth
    const token = client.handshake?.auth?.token;

    if (!token || token === 'web-dashboard') {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: no valid JWT token provided`);
      return { success: false, error: 'Authentication token required' };
    }

    // Verify JWT token
    let decoded: any;
    try {
      // Pin the algorithm so a token can't force verification under a different
      // scheme (none-alg / RS↔HS confusion) — defense-in-depth (L10).
      decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] });
    } catch (err: any) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: invalid/expired token - ${err.message}`);
      return { success: false, error: 'Invalid or expired token' };
    }

    // Verify the token payload matches the authenticate payload
    const tokenUserId = decoded.sub || decoded.userId;
    if (tokenUserId !== payload.userId) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: userId mismatch (token: ${tokenUserId}, payload: ${payload.userId})`);
      return { success: false, error: 'User identity mismatch' };
    }

    // Use ONLY data from the verified token — never fall back to the
    // client-supplied payload (that let a socket self-assign any role/org room).
    const userId = tokenUserId;
    const role = decoded.role;
    const organizationId = decoded.organizationId;

    if (!role || !organizationId) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: token missing role/organization claims`);
      return { success: false, error: 'Token missing required claims' };
    }

    /*
      The account must still be able to be here — active, in this organization,
      organization not suspended — and what it may see comes from the DATABASE,
      resolved the way the API resolves a session. A token is a snapshot of the
      moment it was minted.
    */
    let socketAccess: SocketAccess | null | undefined;
    try {
      socketAccess = await resolveSocketAccess(this.prisma, userId, organizationId, decoded.iat ?? 0);
    } catch (e) {
      // A database blip must not take realtime down for everybody: fall back to
      // the token for THIS connection; the next join re-resolves.
      this.logger.warn(`[AUTH] access resolution failed for ${userId}, using token claims: ${e}`);
      socketAccess = undefined;
    }
    if (socketAccess === null) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: account inactive, moved, organization suspended or token revoked`);
      return { success: false, error: 'Account not active' };
    }

    // A token is a credential until `exp`, not forever: cycle the transport
    // once it lapses so the client reconnects with its CURRENT token.
    this.armExpiry(client, decoded.exp);

    this.logger.log(`[AUTH] Client ${client.id} authenticated as user ${userId} (${role})`);

    const clientInfo: ClientInfo = {
      userId,
      role,
      organizationId,
      tokenIat: typeof decoded.iat === 'number' ? decoded.iat : 0,
      connectedAt: new Date(),
      rooms: [],
      ...(socketAccess ? { access: socketAccess, accessAt: Date.now() } : {}),
    };

    // External CUSTOMER: confine to their OWN user room only. Never join the
    // org/role/taskviewers rooms — otherwise a valid customer token would receive
    // org-wide staff attendance/presence/geofence/join-request events. Customers
    // have no staff-presence footprint and don't broadcast online status.
    if (role === 'CUSTOMER') {
      client.join(`user:${userId}`);
      clientInfo.rooms.push(`user:${userId}`);
      this.connectedClients.set(client.id, clientInfo);
      clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);
      this.logger.log(`[AUTH] Customer ${userId} confined to user room only`);
      return { success: true, rooms: clientInfo.rooms };
    }

    // Join organization room
    client.join(`org:${organizationId}`);
    clientInfo.rooms.push(`org:${organizationId}`);

    // Join role-specific room — ORG-NAMESPACED. A bare `role:ADMIN` room is
    // global across all tenants, so worker-GPS and attendance-escalation
    // broadcasts targeting it leaked into every org's admins (sec audit C5).
    client.join(`role:${organizationId}:${role}`);
    clientInfo.rooms.push(`role:${organizationId}:${role}`);

    // Join user-specific room
    client.join(`user:${userId}`);
    clientInfo.rooms.push(`user:${userId}`);

    // "Task viewers" room — admins and members granted "view all tasks". Org-wide
    // task events go here instead of to the whole org, so plain employees don't
    // receive (or get the payload of) tasks they can't see.
    //
    // ⚠️ ORG-WIDE grant only, read from the resolved access — the org role, or
    // the legacy column while ACCESS_IGNORE_LEGACY_FLAGS is off, exactly as the
    // API decides. It used to read the token's `canViewAllTasks` claim, which is
    // minted from the legacy column alone and frozen at sign-in. A grant held
    // only in a SPACE does not qualify: this room carries every space's tasks.
    // Only when the database could not be asked does the claim stand in.
    const viewsAllTasks = socketAccess
      ? socketAccess.access.org?.canViewAllTasks === true
      : decoded.canViewAllTasks === true;
    if (role === 'ADMIN' || viewsAllTasks) {
      client.join(`taskviewers:${organizationId}`);
      clientInfo.rooms.push(`taskviewers:${organizationId}`);
    }

    // Cross-org shared spaces: join a per-space room so this org's members receive
    // LIVE task events for spaces shared WITH them. Server-authoritative — the org
    // comes from the verified token and the shares from the DB, never from the
    // client. Owner-side members already get these via taskviewers:{ownerOrg}, so
    // they don't join here (no double-delivery). Once per connection; the query is
    // indexed on [guestOrgId,status] and returns nothing for the vast majority.
    try {
      const shares = await this.prisma.spaceShare.findMany({
        where: { guestOrgId: organizationId, status: 'ACTIVE' },
        select: { spaceId: true },
      });
      for (const s of shares) {
        client.join(`space:${s.spaceId}`);
        clientInfo.rooms.push(`space:${s.spaceId}`);
      }
      if (shares.length) this.logger.log(`[AUTH] ${userId} joined ${shares.length} shared-space room(s)`);
    } catch (e) {
      this.logger.warn(`[AUTH] shared-space room join failed for ${userId}: ${e}`);
    }

    // Authenticated — cancel the idle-disconnect timer.
    clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);

    // Reconnected within the grace window → cancel any pending "mark offline".
    const pendingOffline = this.offlineTimers.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      this.offlineTimers.delete(userId);
    }

    // Was this user fully offline before this socket? (no other live socket)
    const wasOffline = !this.userHasActiveSocket(userId);

    this.connectedClients.set(client.id, clientInfo);

    // Mark them active immediately, and — only on a true offline→online flip —
    // broadcast so teammates' dashboards pull them back in without a refresh.
    // (Skipped for extra tabs/reconnects where they were already online.)
    void this.markOnline(userId, organizationId, wasOffline);

    this.logger.log(`[AUTH] Client ${client.id} joined rooms: ${clientInfo.rooms.join(', ')}`);

    // Seed current support agent presence to this socket — presence is otherwise
    // only broadcast on transitions, so a customer connecting while an agent is
    // already online would never learn live chat is available.
    client.emit(SocketEvents.SUPPORT_AGENT_PRESENCE, { online: this.anyAgentOnline() });

    return { success: true, rooms: clientInfo.rooms };
  }

  // Support agents (operator staff) authenticate with the platform key, NOT a JWT
  // — they are not app users. They join the `support-agents` room to receive every
  // ticket event (including internal notes) and drive live-chat presence.
  @SubscribeMessage('authenticate_agent')
  async handleAuthenticateAgent(client: Socket) {
    const auth = client.handshake?.auth ?? {};
    let authed = false;
    // Path 1: legacy shared platform key (operator console).
    // Constant-time: `===` leaks how much of the operator key matched.
    if (this.platformAdminKey && typeof auth.platformKey === 'string' && safeEqual(auth.platformKey, this.platformAdminKey)) {
      authed = true;
      // Recorded like every static-key call (actor "static-key" + declared agent name).
      recordStaticKeyAgentSocket(this.prisma as any, {
        agent: auth.agent,
        ip: client.handshake?.address ?? null,
        userAgent: client.handshake?.headers?.['user-agent'],
      }).catch((e) => this.logger.warn(`[AUTH] platform audit write failed for agent socket ${client.id}: ${e}`));
    }
    // Path 2: platform-staff JWT (admin.hbcfield.com) — verify, then ask the
    // DATABASE: still active, minted after their cut-off, and their CURRENT
    // role holds manageSupport (socket-access.ts operatorMaySupport). Like an
    // app socket, it is cut when the token lapses.
    if (!authed && this.platformJwtSecret && auth.token) {
      let p: any = null;
      try {
        p = jwt.verify(auth.token, this.platformJwtSecret, { algorithms: ['HS256'] });
      } catch { /* invalid token */ }
      try {
        if (p && (await operatorMaySupport(this.prisma, p, platformCan))) {
          authed = true;
          this.armExpiry(client, p.exp);
        }
      } catch (e) {
        this.logger.warn(`[AUTH] operator check failed for agent socket ${client.id}: ${e}`);
      }
    }
    if (!authed) {
      this.logger.warn(`[AUTH] Agent socket ${client.id} rejected`);
      return { success: false, error: 'Not authorized' };
    }
    clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);
    client.join('support-agents');
    const wasEmpty = !this.anyAgentOnline();
    this.agentSockets.add(client.id);
    this.logger.log(`[AUTH] Support agent socket ${client.id} joined support-agents`);
    // First agent online → tell customers live chat is available.
    if (wasEmpty) this.server.emit(SocketEvents.SUPPORT_AGENT_PRESENCE, { online: true });
    return { success: true };
  }

  /**
   * Live-chat typing indicator relay. Customer → agents; agent → the ticket owner.
   *
   * ⚠️ Nothing here is taken from the client but the ticket id. It used to
   * relay to any `customerId` the payload named and trust `from` — so ANY
   * socket, authenticated or not, could put "…is typing" on any user's screen
   * and into the operator inbox. Now:
   *   - an AGENT socket (verified in authenticate_agent) reaches the ticket's
   *     own creator, read from the ticket;
   *   - an app user reaches the agents only for a ticket THEY raised;
   *   - everyone else (unauthenticated, portal customers) is ignored.
   */
  @SubscribeMessage('support_typing')
  async handleSupportTyping(client: Socket, payload: { ticketId: string }) {
    const ticketId = payload?.ticketId;
    if (!ticketId || typeof ticketId !== 'string' || ticketId.length > 64) return;

    const isAgent = this.agentSockets.has(client.id);
    const member = this.connectedClients.get(client.id);
    // Portal customers have a live socket but no support surface.
    if (!isAgent && (!member || member.role === 'CUSTOMER')) return;

    const createdById = await this.ticketCreator(ticketId);
    if (!createdById) return;

    if (isAgent) {
      this.server.to(`user:${createdById}`).emit(SocketEvents.SUPPORT_TYPING, { ticketId, from: 'AGENT' });
    } else if (member && member.userId === createdById) {
      this.server.to('support-agents').emit(SocketEvents.SUPPORT_TYPING, { ticketId, from: 'CUSTOMER' });
    }
  }

  /**
   * Who raised a ticket — cached briefly, because typing fires per keystroke and
   * a ticket's creator never changes. Bounded so a stream of made-up ids cannot
   * grow it without limit.
   */
  private ticketCreatorCache = new Map<string, { id: string | null; exp: number }>();
  private async ticketCreator(ticketId: string): Promise<string | null> {
    const hit = this.ticketCreatorCache.get(ticketId);
    if (hit && hit.exp > Date.now()) return hit.id;
    const t = await (this.prisma as any).supportTicket
      .findUnique({ where: { id: ticketId }, select: { createdById: true } })
      .catch(() => null);
    const id: string | null = t?.createdById ?? null;
    if (this.ticketCreatorCache.size >= 1000) this.ticketCreatorCache.clear();
    this.ticketCreatorCache.set(ticketId, { id, exp: Date.now() + 5 * 60_000 });
    return id;
  }

  /**
   * Chat typing indicator — relayed to the other conversation members.
   *
   * Two things this must not do, both of which it used to.
   *
   * It must not leave the organization. A cross-org conversation is held open
   * by a shared space so two companies can coordinate work; that is agreement
   * to exchange messages, not a licence to watch someone type in real time.
   * Presence and typing say when a person is at their desk and how they are
   * composing a sentence, which is a level of visibility into another
   * business's staff nobody signed up for.
   *
   * And it must not take the recipient list from the client. `recipientIds`
   * arrives over the wire, so anything a member could name, they could make
   * "…is typing" appear on — including people they share no conversation with.
   * The sender's own organization is read from their authenticated socket, and
   * every recipient is checked against the sockets actually connected. Typing
   * is ephemeral: a recipient who is not connected has nothing to receive, so
   * resolving through live sockets costs nothing and closes both holes at once.
   */
  @SubscribeMessage('chat_typing')
  handleChatTyping(client: Socket, payload: { conversationId: string; recipientIds: string[]; from: string }) {
    const sender = this.connectedClients.get(client.id);
    // Portal customers are excluded from member chat entirely — reject any
    // chat-typing relay from a customer socket (spoof defense).
    if (!sender || sender.role === 'CUSTOMER') return;
    if (!payload?.conversationId || !Array.isArray(payload.recipientIds)) return;

    // Organizations of everyone currently connected, so a recipient can be
    // checked without a database round trip on every keystroke.
    const orgByUser = new Map<string, string>();
    for (const info of this.connectedClients.values()) {
      if (info.role !== 'CUSTOMER') orgByUser.set(info.userId, info.organizationId);
    }

    const evt = { conversationId: payload.conversationId, from: sender.userId };
    for (const uid of new Set(payload.recipientIds)) {
      if (uid === sender.userId) continue;
      if (orgByUser.get(uid) !== sender.organizationId) continue; // absent or elsewhere
      this.server.to(`user:${uid}`).emit(SocketEvents.CHAT_TYPING, evt);
    }
  }

  // Lets a client ask whether a human agent is online right now (live-chat gating).
  @SubscribeMessage('support_agent_presence')
  handleSupportAgentPresenceQuery() {
    return { online: this.anyAgentOnline() };
  }

  @SubscribeMessage('join_task')
  async handleJoinTask(client: Socket, payload: { taskId: string }) {
    const clientInfo = this.connectedClients.get(client.id);

    if (!clientInfo || !clientInfo.organizationId) {
      this.logger.warn(`[JOIN] Client ${client.id} rejected: not authenticated`);
      return { success: false, error: 'Must authenticate before joining task rooms' };
    }

    // Cap task-room membership per socket (a client only ever views a handful of
    // tasks at once) — stops a socket from joining unbounded rooms.
    const taskRoomCount = clientInfo.rooms.filter((r) => r.startsWith('task:')).length;
    if (taskRoomCount >= 50) {
      this.logger.warn(`[JOIN] Client ${client.id} rejected: task-room limit reached`);
      return { success: false, error: 'Too many task subscriptions' };
    }

    // Tenant isolation (L1) AND visibility: the task room carries the task's
    // full payload on every change, so joining it is READING the task. It used
    // to check only the organization — any member could subscribe to any task
    // in their company by id, including ones the API refuses them. Now the
    // API's own rule (`canAccessTask`) is asked, with access resolved from the
    // database. A refusal does not say whether the task exists.
    if (!payload?.taskId || typeof payload.taskId !== 'string' || payload.taskId.length > 64) {
      return { success: false, error: 'taskId is required' };
    }
    // Portal customers see their own requests through the portal, not task rooms.
    if (clientInfo.role === 'CUSTOMER') return { success: false, error: 'Task not found' };
    let allowed = false;
    try {
      const access = await this.freshAccess(clientInfo);
      allowed = !!access && (await socketMayOpenTask(this.prisma, { userId: clientInfo.userId, organizationId: clientInfo.organizationId, ...access }, payload.taskId));
    } catch (e) {
      this.logger.warn(`[JOIN] visibility check failed for ${client.id}: ${e}`);
      allowed = false; // fail closed
    }
    if (!allowed) {
      this.logger.warn(`[JOIN] Client ${client.id} (org: ${clientInfo.organizationId}) refused task ${payload.taskId}`);
      return { success: false, error: 'Task not found' };
    }

    const roomName = `task:${payload.taskId}`;
    if (clientInfo.rooms.includes(roomName)) return { success: true };
    client.join(roomName);
    clientInfo.rooms.push(roomName);

    this.logger.log(`[JOIN] Client ${client.id} (org: ${clientInfo.organizationId}) joined room ${roomName}`);
    return { success: true };
  }

  @SubscribeMessage('leave_task')
  handleLeaveTask(client: Socket, payload: { taskId: string }) {
    const roomName = `task:${payload.taskId}`;
    client.leave(roomName);

    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.rooms = clientInfo.rooms.filter(r => r !== roomName);
    }

    this.logger.log(`[LEAVE] Client ${client.id} left room ${roomName}`);
    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    this.logger.debug(`[PING] Client ${client.id}`);
    return { pong: true, timestamp: Date.now() };
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
      const decoded: any = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] });
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

  private disconnectWhere(match: (c: ClientInfo) => boolean, reason: string, label: string) {
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
  private armExpiry(client: Socket, exp: unknown) {
    const holder = client as unknown as { __expiryTimer?: NodeJS.Timeout };
    clearTimeout(holder.__expiryTimer);
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return;
    const wait = exp * 1000 + EXPIRY_GRACE_MS - Date.now();
    holder.__expiryTimer = setTimeout(() => {
      if (wait > MAX_TIMER_MS) return this.armExpiry(client, exp); // still far off: re-arm
      this.logger.log(`[AUTH] Token expired on ${client.id} — cycling transport for re-authentication`);
      // Out of every room at once; the disconnect that follows cleans up the rest.
      for (const room of client.rooms) if (room !== client.id) client.leave(room);
      client.emit('session_expired', { reason: 'token_expired' });
      if (client.conn && typeof client.conn.close === 'function') client.conn.close();
      else client.disconnect(true);
    }, Math.max(0, Math.min(wait, MAX_TIMER_MS)));
    holder.__expiryTimer.unref?.();
  }

  /** The socket's access, re-read from the database once it is a minute old. */
  private async freshAccess(info: ClientInfo): Promise<SocketAccess | null> {
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

  // =========================================================================
  // TASK DELETED EVENT
  // =========================================================================

  emitTaskDeleted(taskId: string, organizationId: string, spaceId?: string) {
    this.logger.log(`[EMIT] task.deleted (taskId: ${taskId}) to taskviewers:${organizationId}`);
    this.messagesSent++;
    let target = this.server.to(`taskviewers:${organizationId}`).to(`task:${taskId}`);
    // Cross-org shared-space guests live in space:{spaceId}, not taskviewers.
    if (spaceId) target = target.to(`space:${spaceId}`);
    target.emit(SocketEvents.TASK_DELETED, { taskId, organizationId });
  }

  // Get connection statistics
  getStats(): SocketStats {
    const connectionsByRole: Record<string, number> = {};
    const connectionsByOrg: Record<string, number> = {};

    this.connectedClients.forEach(client => {
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

  // Emit methods called by notification controller
  // Cross-org shared-space guests live in `space:{spaceId}` (not taskviewers of the
  // owner org), so task events must also fan out there. Owner members get it via
  // taskviewers; guests via the space room — Socket.IO dedups any client in both.
  private taskTargets(task: any) {
    let t = this.server.to(`taskviewers:${task.organizationId}`);
    if (task.spaceId) t = t.to(`space:${task.spaceId}`);
    return t;
  }

  emitTaskCreated(task: any) {
    this.logger.log(`[EMIT] task.created to org:${task.organizationId}`);
    this.messagesSent++;
    this.taskTargets(task).emit(SocketEvents.TASK_CREATED, task);
  }

  emitTaskAssigned(task: any, workerId: string) {
    this.logger.log(`[EMIT] task.assigned to org:${task.organizationId} and user:${workerId}`);
    this.messagesSent += 2;
    this.taskTargets(task).emit(SocketEvents.TASK_ASSIGNED, task);
    this.server.to(`user:${workerId}`).emit(SocketEvents.TASK_ASSIGNED, task);
  }

  /*
    "Something on this job changed" — a checklist tick, an owner, a file, a
    dependency, somebody joining the crew. ⚠️ task-service has emitted
    `task_updated` from fourteen places and nothing here listened, so no open
    screen ever heard of any of them: a phone showed an item as free after
    somebody had taken it, until its own next tap.

    • THE ID ONLY. Each screen re-reads through its own authorized request; the
      payload carries nothing a room member could not already open.
    • TO WHO COULD SEE IT: the task viewers of its org, its workspace's room
      (cross-org shares), and every person on its crew — a field worker is in
      none of the first two.
    • COALESCED per job: a burst (three people ticking together) is one
      announcement, so an office list is not refetched per tap.
  */
  private readonly updatePending = new Map<string, ReturnType<typeof setTimeout>>();
  announceTaskChanged(taskId: string, delayMs = 400): void {
    if (!taskId || this.updatePending.has(taskId)) return;
    this.updatePending.set(taskId, setTimeout(() => {
      this.updatePending.delete(taskId);
      void this.sendTaskChanged(taskId).catch((e) => this.logger.warn(`[EMIT] task.updated ${taskId} failed: ${e}`));
    }, delayMs));
  }

  private async sendTaskChanged(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, organizationId: true, spaceId: true, assignedToId: true, assignees: { select: { userId: true }, take: 50 } },
    });
    if (!task) return;
    const people = new Set([task.assignedToId, ...task.assignees.map((a) => a.userId)].filter((x): x is string => !!x));
    let target = this.taskTargets(task).to(`task:${task.id}`);
    for (const id of people) target = target.to(`user:${id}`);
    this.messagesSent++;
    target.emit(SocketEvents.TASK_UPDATED, { id: task.id, task: { id: task.id } });
    this.logger.debug(`[EMIT] task.updated ${task.id} → viewers, space, ${people.size} on the crew`);
  }

  emitTaskUpdated(task: any) {
    this.logger.log(`[EMIT] task.updated to org:${task.organizationId}`);
    this.messagesSent++;
    this.taskTargets(task).emit(SocketEvents.TASK_UPDATED, task);
    if (task.assignedToId) {
      this.messagesSent++;
      this.server.to(`user:${task.assignedToId}`).emit(SocketEvents.TASK_UPDATED, task);
    }
  }

  emitTaskDeclined(task: any, declinedBy: any) {
    this.logger.log(`[EMIT] task.declined to org:${task.organizationId} (declined by: ${declinedBy?.firstName} ${declinedBy?.lastName})`);
    this.messagesSent += 2;
    // Notify the organization (dispatcher and client will see this)
    this.server.to(`taskviewers:${task.organizationId}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
    // Notify anyone watching this specific task
    this.server.to(`task:${task.id}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
  }

  emitTaskStatusChanged(task: any, oldStatus: string, newStatus: string) {
    this.logger.log(`[EMIT] task.statusChanged (${oldStatus} -> ${newStatus}) to task:${task.id}`);
    this.messagesSent++;
    const payload = { task, oldStatus, newStatus };
    // Single emit across the task room + org taskviewers + shared-space room + the
    // creator's own room. The creator room lets a portal CUSTOMER (confined to
    // user:{id}) watch their request update live; Socket.IO dedups a staff creator
    // who is also a taskviewer.
    let target = this.server.to(`task:${task.id}`).to(`taskviewers:${task.organizationId}`);
    if (task.spaceId) target = target.to(`space:${task.spaceId}`);
    if (task.createdById) target = target.to(`user:${task.createdById}`);
    target.emit(SocketEvents.TASK_STATUS_CHANGED, payload);
  }

  emitCommentAdded(taskId: string, comment: any) {
    this.logger.log(`[EMIT] task.commentAdded to task:${taskId}`);
    this.messagesSent++;
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_COMMENT_ADDED, { taskId, comment });
  }

  emitAttachmentAdded(taskId: string, attachment: any) {
    this.logger.log(`[EMIT] task.attachmentAdded to task:${taskId}`);
    this.messagesSent++;
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_ATTACHMENT_ADDED, { taskId, attachment });
  }

  emitWorkerLocationUpdated(organizationId: string, workerId: string, location: any) {
    // Without an org, we cannot scope the broadcast — drop it rather than leak
    // it platform-wide (the old global `role:ADMIN` room was the C5 leak).
    if (!organizationId) return;
    // Throttle: GPS points can arrive every few seconds — the live map only
    // needs ~1 update / 3s per worker, so we drop the in-between broadcasts.
    const now = Date.now();
    if (now - (this.lastLocationEmit.get(workerId) || 0) < 3000) return;
    this.lastLocationEmit.set(workerId, now);

    this.logger.debug(`[EMIT] worker.locationUpdated for worker ${workerId}`);
    this.messagesSent++;
    // Live-map viewers = admins of THIS org only. Historical points are still
    // stored by tracking-service regardless of this throttle.
    this.server.to(`role:${organizationId}:ADMIN`).emit(SocketEvents.WORKER_LOCATION_UPDATED, { workerId, location });
  }

  // =========================================================================
  // ATTENDANCE EVENTS
  // =========================================================================

  /**
   * A space changed (created / edited / archived / deleted). Org-wide, because
   * every member's space list may be affected; the client re-reads through its
   * own scoped endpoints, so this carries an id, not the space itself.
   */
  emitSpaceChanged(organizationId: string, spaceId: string | null) {
    this.logger.debug(`[EMIT] space.changed for org ${organizationId}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.SPACE_CHANGED, { spaceId });
  }

  /**
   * A document type changed — including WHO MAY SEE IT.
   *
   * Org-wide, and deliberately carrying only an id: each client re-reads through
   * its own scoped endpoints, so a member whose role cannot see the type learns
   * nothing from the event itself. Broadcasting the type would hand them the
   * label of a payslip category they are not allowed to know exists.
   */
  emitDocumentTypesChanged(organizationId: string, typeId: string | null) {
    this.logger.debug(`[EMIT] documents.typesChanged for org ${organizationId}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.DOCUMENT_TYPES_CHANGED, { typeId });
  }

  /** Someone was added to or removed from a space's roster. */
  emitSpaceRosterChanged(organizationId: string, spaceId: string | null) {
    this.logger.debug(`[EMIT] space.rosterChanged for org ${organizationId}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.SPACE_ROSTER_CHANGED, { spaceId });
  }

  emitClockIn(userId: string, organizationId: string, timeEntry: any) {
    this.logger.log(`[EMIT] attendance.clockIn for user ${userId}`);
    this.messagesSent += 1;
    // Single de-duplicated emit: a socket in BOTH rooms (e.g. the user viewing
    // their own org) would otherwise receive two copies.
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.CLOCK_IN, { userId, timeEntry });
  }

  emitClockOut(userId: string, organizationId: string, timeEntry: any) {
    this.logger.log(`[EMIT] attendance.clockOut for user ${userId}`);
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.CLOCK_OUT, { userId, timeEntry });
  }

  // =========================================================================
  // BREAK EVENTS
  // =========================================================================

  emitBreakStarted(userId: string, organizationId: string, breakData: any) {
    this.logger.log(`[EMIT] break.started for user ${userId}`);
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.BREAK_STARTED, { userId, break: breakData });
  }

  emitBreakEnded(userId: string, organizationId: string, breakData: any) {
    this.logger.log(`[EMIT] break.ended for user ${userId}`);
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.BREAK_ENDED, { userId, break: breakData });
  }

  // Availability (Available/Busy/Away) changed — org-wide (teammates see status
  // on dashboards / contact lists). Low frequency, so a plain org broadcast.
  emitPresenceChanged(userId: string, presence: string | null, organizationId: string) {
    this.logger.debug(`[EMIT] presence.changed for user ${userId} -> ${presence}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.PRESENCE_CHANGED, { userId, presence });
  }

  // =========================================================================
  // SUPPORT EVENTS
  // =========================================================================

  /** A new support message. Internal notes go to agents only; else customer + agents. */
  emitSupportMessage(payload: {
    ticketId: string;
    message: any;
    ticket: any;
    isInternalNote?: boolean;
    customerId: string;
  }) {
    this.messagesSent += 1;
    const evt = { ticketId: payload.ticketId, message: payload.message, ticket: payload.ticket };
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_MESSAGE, evt);
    if (!payload.isInternalNote) {
      this.server.to(`user:${payload.customerId}`).emit(SocketEvents.SUPPORT_MESSAGE, evt);
    }
  }

  /** Ticket status/assignment/SLA changed → refresh the customer + agent views. */
  emitSupportTicketUpdated(ticket: any) {
    this.messagesSent += 1;
    const evt = { ticket };
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    if (ticket?.createdById) {
      this.server.to(`user:${ticket.createdById}`).emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    }
  }

  /** SLA breached → agents only (escalation surfaces in the inbox). */
  emitSupportSlaBreached(ticket: any) {
    this.messagesSent += 1;
    this.logger.warn(`[EMIT] support SLA breached: ticket ${ticket?.id}`);
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, { ticket, slaBreached: true });
  }

  // =========================================================================
  // CHAT EVENTS (member-to-member)
  // =========================================================================

  /** Deliver a new chat message to every member's user room (incl. the sender's
   *  other devices) — they're already joined to user:{id} after authenticate. */
  emitChatMessage(payload: { conversationId: string; message: any; recipients: string[] }) {
    this.messagesSent += 1;
    const evt = { conversationId: payload.conversationId, message: payload.message };
    const targets = new Set<string>([...(payload.recipients || [])]);
    if (payload.message?.senderId) targets.add(payload.message.senderId);
    for (const uid of targets) {
      this.server.to(`user:${uid}`).emit(SocketEvents.CHAT_MESSAGE, evt);
    }
  }

  // =========================================================================
  // GENERIC EMIT METHODS
  // =========================================================================

  /**
   * Emit an event to all clients in an organization
   */
  emitToOrganization(organizationId: string, event: string, data: any) {
    this.logger.log(`[EMIT] ${event} to org:${organizationId}`);
    this.messagesSent++;
    this.server.to(`org:${organizationId}`).emit(event, data);
  }

  /**
   * Emit an event to a specific user
   */
  emitToUser(userId: string, event: string, data: any) {
    this.logger.log(`[EMIT] ${event} to user:${userId}`);
    this.messagesSent++;
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit an event to all clients with a specific role
   */
  emitToRole(organizationId: string, role: string, event: string, data: any) {
    // Org-scoped: never broadcast to a global role room (sec audit C5).
    if (!organizationId) return;
    this.logger.log(`[EMIT] ${event} to role:${organizationId}:${role}`);
    this.messagesSent++;
    this.server.to(`role:${organizationId}:${role}`).emit(event, data);
  }
}
