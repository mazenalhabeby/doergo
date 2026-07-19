import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

/**
 * Bridges chat domain events (from task-service) to real-time sockets + push.
 */
@Controller()
export class ChatNotificationHandler {
  private readonly logger = new Logger('ChatNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('chat_message')
  async handleMessage(
    @Payload() data: { conversationId: string; message: any; recipients: string[]; organizationId: string },
  ) {
    this.websocketGateway.emitChatMessage(data);
    // Push each recipient (delivered only to those with registered tokens; the
    // socket already covers anyone with the app open).
    const sender = data.message?.sender;
    const name = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'New message';
    for (const userId of data.recipients || []) {
      try {
        await this.pushService.sendToUser(userId, name, (data.message?.body ?? '').slice(0, 120), {
          type: 'chat',
          conversationId: data.conversationId,
        });
      } catch (e) {
        this.logger.error(`chat push failed for ${userId}: ${(e as Error).message}`);
      }
    }
  }
}
