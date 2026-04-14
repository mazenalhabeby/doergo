import { Controller, Get, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PushService } from './modules/push/push.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';

/**
 * Main controller — HTTP health/stats endpoints + push token management.
 * Event handlers are split into domain-specific handlers in ./handlers/
 */
@Controller()
export class NotificationController {
  private readonly logger = new Logger('NotificationController');

  constructor(
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
  // PUSH TOKEN MANAGEMENT (MessagePattern - request/response)
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
}
