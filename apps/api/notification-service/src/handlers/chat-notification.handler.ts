import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { msg, verbatim } from '../i18n/translate';

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
    // The title is the sender's name and the body is their message — neither is
    // translated. Only the fallback when there is no sender is.
    const sender = data.message?.sender;
    const senderName = sender ? `${sender.firstName ?? ''} ${sender.lastName ?? ''}`.trim() : '';
    try {
      await this.pushService.sendToUsers(
        data.recipients || [],
        { title: senderName ? verbatim(senderName) : msg('chat.newMessage'), body: verbatim(data.message?.body, 120) },
        { type: 'chat', conversationId: data.conversationId },
      );
    } catch (e) {
      this.logger.error(`chat push failed: ${(e as Error).message}`);
    }
  }
}
