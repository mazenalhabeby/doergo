import { Injectable, Logger } from '@nestjs/common';
import { SocketEvents, attendanceEventRooms } from '@hbcfield/shared';
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
  // ATTENDANCE EVENTS — never the organization room (clock review A1)
  // =========================================================================

  /**
   * A member's clock event: to the people who may read those hours (attendance rooms, shared
   * `attendanceEventRooms`) and, when given, the member. One de-duplicated emit — a socket in several of
   * those rooms receives it once. Without a workspace only the org-wide viewers hear it (fewer, never more).
   */
  emitAttendance(
    organizationId: string,
    spaceId: string | null | undefined,
    subjectUserId: string | null | undefined,
    event: string,
    data: unknown,
  ) {
    if (!organizationId) return;
    this.logger.log(`[EMIT] ${event} to attendance:${organizationId}${spaceId ? `:${spaceId}` : ''}`);
    this.registry.messagesSent += 1;
    this.registry.server.to(attendanceEventRooms(organizationId, spaceId, subjectUserId)).emit(event, data);
  }

  emitClockIn(userId: string, organizationId: string, timeEntry: unknown) {
    this.emitAttendance(organizationId, entrySpace(timeEntry), userId, SocketEvents.CLOCK_IN, { userId, timeEntry });
  }

  emitClockOut(userId: string, organizationId: string, timeEntry: unknown) {
    this.emitAttendance(organizationId, entrySpace(timeEntry), userId, SocketEvents.CLOCK_OUT, { userId, timeEntry });
  }

  emitBreakStarted(userId: string, organizationId: string, breakData: unknown, spaceId?: string | null) {
    this.emitAttendance(organizationId, spaceId, userId, SocketEvents.BREAK_STARTED, { userId, break: breakData });
  }

  emitBreakEnded(userId: string, organizationId: string, breakData: unknown, spaceId?: string | null) {
    this.emitAttendance(organizationId, spaceId, userId, SocketEvents.BREAK_ENDED, { userId, break: breakData });
  }
}

/** The workspace a passed-through time entry belongs to (`locationId`), if it carries one. */
function entrySpace(timeEntry: unknown): string | null {
  const id = (timeEntry as { locationId?: unknown } | null)?.locationId;
  return typeof id === 'string' && id ? id : null;
}
