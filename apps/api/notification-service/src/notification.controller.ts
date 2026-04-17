import { Controller, Get, Logger } from '@nestjs/common';
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
  getSocketStats() {
    return this.websocketGateway.getStats();
  }

  @Get('socket/clients')
  getConnectedClients() {
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
