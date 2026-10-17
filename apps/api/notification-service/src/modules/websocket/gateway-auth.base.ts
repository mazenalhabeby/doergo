import { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { SocketEvents, platformCan } from '@hbcfield/shared';
import { operatorMaySupport, resolveSocketAccess, socketMayOpenTask, type SocketAccess } from './socket-access';
import type { ClientInfo } from './gateway.types';
import { GatewayChatEmitsBase } from './gateway-chat-emits.base';
import type { AccessTokenClaims } from './socket-payloads';

/**
 * The bodies of the `authenticate`, `authenticate_agent` and `join_task` handlers —
 * moved here unchanged from websocket.gateway.ts, whose @SubscribeMessage methods
 * call them.
 */
export abstract class GatewayAuthBase extends GatewayChatEmitsBase {
  protected async authenticateClient(
    client: Socket,
    payload: { userId: string; role: string; organizationId: string },
  ) {
    // Extract token from socket handshake auth
    const token = client.handshake?.auth?.token;

    if (!token || token === 'web-dashboard') {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: no valid JWT token provided`);
      return { success: false, error: 'Authentication token required' };
    }

    // Verify JWT token
    let decoded: AccessTokenClaims;
    try {
      // Pin the algorithm so a token can't force verification under a different
      // scheme (none-alg / RS↔HS confusion) — defense-in-depth (L10).
      decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as AccessTokenClaims;
    } catch (err: unknown) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: invalid/expired token - ${(err as Error).message}`);
      return { success: false, error: 'Invalid or expired token' };
    }

    // Verify the token payload matches the authenticate payload
    const tokenUserId = decoded.sub || decoded.userId;
    if (tokenUserId !== payload.userId) {
      this.logger.warn(
        `[AUTH] Client ${client.id} rejected: userId mismatch (token: ${tokenUserId}, payload: ${payload.userId})`,
      );
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
      this.logger.warn(
        `[AUTH] Client ${client.id} rejected: account inactive, moved, organization suspended or token revoked`,
      );
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

  protected async authenticateAgent(client: Socket) {
    const auth = client.handshake?.auth ?? {};
    let authed = false;
    // The platform-staff JWT (admin.hbcfield.com) — verify, then ask the
    // DATABASE: still active, minted after their cut-off, and their CURRENT
    // role holds manageSupport (socket-access.ts operatorMaySupport). Like an
    // app socket, it is cut when the token lapses.
    if (this.platformJwtSecret && auth.token) {
      let p: (AccessTokenClaims & { typ?: unknown }) | null = null;
      try {
        p = jwt.verify(auth.token, this.platformJwtSecret, { algorithms: ['HS256'] }) as AccessTokenClaims & {
          typ?: unknown;
        };
      } catch {
        /* invalid token */
      }
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

  protected async joinTask(client: Socket, payload: { taskId: string }) {
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
      allowed =
        !!access &&
        (await socketMayOpenTask(
          this.prisma,
          { userId: clientInfo.userId, organizationId: clientInfo.organizationId, ...access },
          payload.taskId,
        ));
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
}
