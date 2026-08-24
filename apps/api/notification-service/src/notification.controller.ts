import { Controller, Get, Headers, ForbiddenException, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { EmailService } from './modules/email/email.service';
import { PushService } from './modules/push/push.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';

@Controller()
export class NotificationController {
  private readonly logger = new Logger('NotificationController');

  constructor(
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
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

  @MessagePattern({ cmd: 'register_push_token' })
  async registerPushToken(@Payload() data: {
    userId: string;
    token: string;
    platform: string;
    deviceId?: string;
  }) {
    this.logger.log(`Registering push token for user ${data.userId}`);
    return this.pushService.registerPushToken(data);
  }

  @MessagePattern({ cmd: 'remove_push_token' })
  async removePushToken(@Payload() data: { token: string; userId?: string }) {
    this.logger.log(`Removing push token: ${data.token.substring(0, 20)}...`);
    return this.pushService.removePushToken(data.token);
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

  @EventPattern('user_removed')
  async handleUserRemoved(@Payload() data: { userId: string; organizationId: string }) {
    this.logger.log(`User removed: ${data.userId} from org ${data.organizationId}`);
    this.websocketGateway.forceDisconnectUser(data.userId);
  }

  // An admin changed this member's access/role. Signal the member's own sockets
  // (web + mobile) to re-fetch their profile so nav/screens re-render in place —
  // no reload, no re-login. Reaches ONLY that member via their user room.
  @EventPattern('member_access_updated')
  async handleMemberAccessUpdated(@Payload() data: { memberId: string; organizationId: string }) {
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
  @EventPattern('member_changed')
  async handleMemberChanged(
    @Payload() data: { organizationId: string; memberId?: string; reason?: string },
  ) {
    this.logger.log(
      `Member list changed in org ${data.organizationId} (${data.reason || 'update'})`,
    );
    this.websocketGateway.emitToOrganization(data.organizationId, 'member.changed', {
      memberId: data.memberId,
      reason: data.reason,
    });
  }

  // =========================================================================
  // INVITATION EVENTS
  // =========================================================================

  @EventPattern('invitation_created')
  async handleInvitationCreated(@Payload() data: {
    recipientEmail: string;
    organizationName: string;
    invitationCode: string;
    targetRole: string;
    expiresAt: string;
  }) {
    this.logger.log(`Sending invitation email to ${data.recipientEmail} for org ${data.organizationName}`);
    await this.emailService.sendInvitationEmail(data);
  }
}
