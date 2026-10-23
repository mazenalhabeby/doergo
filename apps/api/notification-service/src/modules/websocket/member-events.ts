import { Injectable, Logger } from '@nestjs/common';
import { SocketEvents } from '@hbcfield/shared';
import { SocketRegistry } from './socket-registry';

/**
 * Events addressed to an organization, a role in it, or one member — the generic
 * emits every event handler uses, and the attendance (clock / break) events.
 */
@Injectable()
export class MemberEvents {
  private readonly logger = new Logger('WebSocketGateway');

  constructor(private readonly registry: SocketRegistry) {}

  /**
   * Emit an event to all clients in an organization
   */
  emitToOrganization(organizationId: string, event: string, data: unknown) {
    this.logger.log(`[EMIT] ${event} to org:${organizationId}`);
    this.registry.messagesSent++;
    this.registry.server.to(`org:${organizationId}`).emit(event, data);
  }

  /**
   * Emit an event to a specific user
   */
  emitToUser(userId: string, event: string, data: unknown) {
    this.logger.log(`[EMIT] ${event} to user:${userId}`);
    this.registry.messagesSent++;
    this.registry.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit an event to all clients with a specific role
   */
  emitToRole(organizationId: string, role: string, event: string, data: unknown) {
    // Org-scoped: never broadcast to a global role room (sec audit C5).
    if (!organizationId) return;
    this.logger.log(`[EMIT] ${event} to role:${organizationId}:${role}`);
    this.registry.messagesSent++;
    this.registry.server.to(`role:${organizationId}:${role}`).emit(event, data);
  }

  // =========================================================================
  // ATTENDANCE EVENTS
  // =========================================================================

  emitClockIn(userId: string, organizationId: string, timeEntry: unknown) {
    this.logger.log(`[EMIT] attendance.clockIn for user ${userId}`);
    this.registry.messagesSent += 1;
    // Single de-duplicated emit: a socket in BOTH rooms (e.g. the user viewing
    // their own org) would otherwise receive two copies.
    this.toMemberAndOrg(userId, organizationId).emit(SocketEvents.CLOCK_IN, { userId, timeEntry });
  }

  emitClockOut(userId: string, organizationId: string, timeEntry: unknown) {
    this.logger.log(`[EMIT] attendance.clockOut for user ${userId}`);
    this.registry.messagesSent += 1;
    this.toMemberAndOrg(userId, organizationId).emit(SocketEvents.CLOCK_OUT, { userId, timeEntry });
  }

  // =========================================================================
  // BREAK EVENTS
  // =========================================================================

  emitBreakStarted(userId: string, organizationId: string, breakData: unknown) {
    this.logger.log(`[EMIT] break.started for user ${userId}`);
    this.registry.messagesSent += 1;
    this.toMemberAndOrg(userId, organizationId).emit(SocketEvents.BREAK_STARTED, { userId, break: breakData });
  }

  emitBreakEnded(userId: string, organizationId: string, breakData: unknown) {
    this.logger.log(`[EMIT] break.ended for user ${userId}`);
    this.registry.messagesSent += 1;
    this.toMemberAndOrg(userId, organizationId).emit(SocketEvents.BREAK_ENDED, { userId, break: breakData });
  }

  private toMemberAndOrg(userId: string, organizationId: string) {
    return this.registry.server.to(`user:${userId}`).to(`org:${organizationId}`);
  }
}
