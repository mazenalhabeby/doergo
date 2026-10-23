import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { ClientInfo, SocketStats } from './gateway.types';

/**
 * The ONE owner of the gateway's live state: the Socket.IO server, every authenticated
 * socket, the support-agent sockets and the message counters. Every collaborator
 * (authentication, presence, rooms, the emitters) reaches it through this provider —
 * nothing keeps a copy.
 */
@Injectable()
export class SocketRegistry {
  private readonly logger = new Logger('WebSocketGateway');

  /** Set once by the gateway's afterInit. */
  server!: Server;

  /** Authenticated sockets, keyed by socket id. */
  readonly clients = new Map<string, ClientInfo>();

  // Support live-chat: socket ids of connected human agents (operator staff).
  // Presence = "is any agent online" → drives the customer's live-chat availability.
  readonly agentSockets = new Set<string>();

  readonly startTime = Date.now();
  messagesReceived = 0;
  messagesSent = 0;

  attach(server: Server) {
    this.server = server;
  }

  /** True if at least one human support agent socket is connected. */
  anyAgentOnline(): boolean {
    return this.agentSockets.size > 0;
  }

  /** True if the user still has at least one authenticated socket connected. */
  userHasActiveSocket(userId: string): boolean {
    for (const info of this.clients.values()) {
      if (info.userId === userId) return true;
    }
    return false;
  }

  /** Is `userId` looking at this conversation on any screen connected here? */
  isViewingConversation(userId: string, conversationId: string): boolean {
    for (const info of this.clients.values()) {
      if (info.userId === userId && info.viewingConversationId === conversationId) return true;
    }
    return false;
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
    for (const [socketId, info] of this.clients) {
      if (!match(info)) continue;
      const socket = this.server?.sockets?.sockets?.get(socketId);
      if (socket) {
        socket.emit('force_disconnect', { reason });
        socket.disconnect(true);
        disconnected++;
      }
      this.clients.delete(socketId);
    }
    if (disconnected > 0) {
      this.logger.log(`[FORCE_DISCONNECT] Disconnected ${disconnected} socket(s) for ${label} (${reason})`);
    }
  }

  // Get connection statistics
  getStats(): SocketStats {
    const connectionsByRole: Record<string, number> = {};
    const connectionsByOrg: Record<string, number> = {};

    this.clients.forEach((client) => {
      connectionsByRole[client.role] = (connectionsByRole[client.role] || 0) + 1;
      connectionsByOrg[client.organizationId] = (connectionsByOrg[client.organizationId] || 0) + 1;
    });

    return {
      totalConnections: this.server?.sockets?.sockets?.size || 0,
      authenticatedClients: this.clients.size,
      connectionsByRole,
      connectionsByOrg,
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      uptime: Date.now() - this.startTime,
    };
  }

  // Get list of connected clients (for debugging)
  getConnectedClients(): Array<ClientInfo & { socketId: string }> {
    return Array.from(this.clients.entries()).map(([socketId, info]) => ({
      socketId,
      ...info,
    }));
  }
}
