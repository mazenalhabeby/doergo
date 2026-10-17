import { Controller, Get, Headers, ForbiddenException, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  customerChangedEvent,
  invitationCreatedEvent,
  memberAccessUpdatedEvent,
  memberChangedEvent,
  organizationSuspendedEvent,
  userLocaleChangedEvent,
  userRemovedEvent,
  userSessionsRevokedEvent,
} from '@hbcfield/shared/microservices';
import { EmailService } from './modules/email/email.service';
import { PushService } from './modules/push/push.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';
import { RecipientLocales } from './i18n/recipient-locales.service';

import { pattern, registerPushToken, removePushToken, type RpcRequest } from '@hbcfield/shared/microservices';
@Controller()
export class NotificationController {
  private readonly logger = new Logger('NotificationController');

  constructor(
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly recipientLocales: RecipientLocales,
  ) {}

  // =========================================================================
  // HTTP ENDPOINTS
  // =========================================================================

  @Get('socket/stats')
  getSocketStats(@Headers('authorization') authHeader: string) {
    if (!this.websocketGateway.verifyStatsAccess(authHeader)) {
      throw new ForbiddenException('Valid admin/manager JWT required to access socket stats');
    }
    return this.websocketGateway.getStats();
  }

  @Get('socket/clients')
  getConnectedClients(@Headers('authorization') authHeader: string) {
    if (!this.websocketGateway.verifyStatsAccess(authHeader)) {
      throw new ForbiddenException('Valid admin/manager JWT required to access socket clients');
    }
    return this.websocketGateway.getConnectedClients();
  }

  @Get('health')
  healthCheck() {
    const stats = this.websocketGateway.getStats();
    return {
      status: 'ok',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
      socket: {
        connections: stats.totalConnections,
        authenticated: stats.authenticatedClients,
      },
    };
  }

  // =========================================================================
  // PUSH TOKEN MANAGEMENT
  // =========================================================================

  @MessagePattern(pattern(registerPushToken))
  async registerPushToken(@Payload() data: RpcRequest<typeof registerPushToken>) {
    this.logger.log(`Registering push token for user ${data.userId}`);
    return this.pushService.registerPushToken(data);
  }

  /**
   * The member changed language on the profile endpoint, which auth-service
   * wrote. Forget the cached one here so the next push reads the new value
   * instead of waiting out the cache.
   */
  @EventPattern(eventPattern(userLocaleChangedEvent))
  handleUserLocaleChanged(@Payload() data: EventPayload<typeof userLocaleChangedEvent>) {
    if (data?.userId) this.recipientLocales.forget(data.userId);
  }

  @MessagePattern(pattern(removePushToken))
  async removePushToken(@Payload() data: RpcRequest<typeof removePushToken>) {
    this.logger.log(`Removing push token: ${data.token.substring(0, 20)}...`);
    return this.pushService.removePushToken(data.token, data.userId);
  }

  // =========================================================================
  // All event handlers are in dedicated handler files:
  //   Task/Location/Blocked → handlers/task-notification.handler.ts
  //   Attendance/Break → handlers/attendance-notification.handler.ts
  //   Join Request → handlers/join-request-notification.handler.ts
  //
  // Only invitation_created is handled here (no handler file).
  // =========================================================================

  // =========================================================================
  // USER REMOVAL EVENTS
  // =========================================================================

  // Revocation → live sockets. Event names are SOCKET_REVOCATION_EVENTS in
  // websocket.gateway.ts; the auth service emits them. A socket authenticates
  // once, so without these a removed / deactivated / suspended account would keep
  // receiving the organization's live events until its connection dropped.
  @EventPattern(eventPattern(userRemovedEvent))
  async handleUserRemoved(@Payload() data: EventPayload<typeof userRemovedEvent>) {
    this.logger.log(`User removed: ${data?.userId} from org ${data?.organizationId}`);
    if (data?.userId) this.websocketGateway.forceDisconnectUser(data.userId, 'removed_from_organization');
  }

  /** Deactivated, signed out everywhere, password reset — every session is gone. */
  @EventPattern(eventPattern(userSessionsRevokedEvent))
  async handleUserSessionsRevoked(@Payload() data: EventPayload<typeof userSessionsRevokedEvent>) {
    this.logger.log(`Sessions revoked: ${data?.userId}`);
    if (data?.userId) this.websocketGateway.forceDisconnectUser(data.userId, 'sessions_revoked');
  }

  /** The operator switched the organization off. */
  @EventPattern(eventPattern(organizationSuspendedEvent))
  async handleOrganizationSuspended(@Payload() data: EventPayload<typeof organizationSuspendedEvent>) {
    this.logger.log(`Organization suspended: ${data?.organizationId}`);
    if (data?.organizationId)
      this.websocketGateway.disconnectOrganization(data.organizationId, 'organization_suspended');
  }

  // An admin changed this member's access/role. Signal the member's own sockets
  // (web + mobile) to re-fetch their profile so nav/screens re-render in place —
  // no reload, no re-login. Reaches ONLY that member via their user room.
  @EventPattern(eventPattern(memberAccessUpdatedEvent))
  async handleMemberAccessUpdated(@Payload() data: EventPayload<typeof memberAccessUpdatedEvent>) {
    this.logger.log(`Member access updated: ${data.memberId} in org ${data.organizationId}`);
    this.websocketGateway.emitToUser(data.memberId, 'member.access_updated', {
      organizationId: data.organizationId,
    });
  }

  // The org's member list changed — someone was added, removed, re-roled,
  // re-scoped, invited, or an invitation was revoked. Broadcast to the ORG room so
  // every open admin screen refreshes in place (audit M-D2). The payload carries
  // IDS ONLY: each client re-reads through its own scoped endpoint, so a broadcast
  // can never widen what a viewer is allowed to see.
  @EventPattern(eventPattern(memberChangedEvent))
  async handleMemberChanged(@Payload() data: EventPayload<typeof memberChangedEvent>) {
    this.logger.log(`Member list changed in org ${data.organizationId} (${data.reason || 'update'})`);
    this.websocketGateway.emitToOrganization(data.organizationId, 'member.changed', {
      memberId: data.memberId,
      reason: data.reason,
    });
  }

  // A client record or its activity timeline changed. Broadcast to the ORG room so
  // every open CRM screen refreshes in place (audit C-D2). Ids only: reps who
  // cannot reach that client refetch and get back what they are allowed to see —
  // the scoping lives in the endpoint, not in who receives the hint.
  @EventPattern(eventPattern(customerChangedEvent))
  async handleCustomerChanged(@Payload() data: EventPayload<typeof customerChangedEvent>) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'customer.changed', {
      customerId: data.customerId,
    });
  }

  // =========================================================================
  // INVITATION EVENTS
  // =========================================================================

  @EventPattern(eventPattern(invitationCreatedEvent))
  async handleInvitationCreated(
    @Payload()
    data: EventPayload<typeof invitationCreatedEvent>,
  ) {
    this.logger.log(`Sending invitation email to ${data.recipientEmail} for org ${data.organizationName}`);
    // ⚠️ invitationCode may be null (an invitation without a stored code) — passed on as before.
    await this.emailService.sendInvitationEmail(data as typeof data & { invitationCode: string });
  }
}
