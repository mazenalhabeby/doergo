import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

/**
 * Bridges support domain events (emitted by task-service) to real-time sockets
 * and push. Agents get the live-chat feed via the `support-agents` room; the
 * customer gets socket + push to their `user:{id}` room.
 */
@Controller()
export class SupportNotificationHandler {
  private readonly logger = new Logger('SupportNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('support_ticket_created')
  async handleCreated(@Payload() data: { ticket: any }) {
    this.logger.log(`Support ticket created: ${data.ticket?.id}`);
    // Surface the new ticket + its first message in every agent inbox.
    this.websocketGateway.emitSupportTicketUpdated(data.ticket);
  }

  @EventPattern('support_message')
  async handleMessage(
    @Payload()
    data: { ticketId: string; message: any; ticket: any; isInternalNote?: boolean; customerId: string },
  ) {
    this.websocketGateway.emitSupportMessage(data);
    // Push the customer when an agent (not an internal note) replies.
    if (!data.isInternalNote && data.message?.authorType === 'AGENT') {
      try {
        await this.pushService.sendToUser(
          data.customerId,
          'Support replied',
          (data.message.body ?? '').slice(0, 120),
          { type: 'support', ticketId: data.ticketId },
        );
      } catch (e) {
        this.logger.error(`support push failed: ${(e as Error).message}`);
      }
    }
  }

  @EventPattern('support_ticket_updated')
  handleUpdated(@Payload() data: { ticket: any }) {
    this.websocketGateway.emitSupportTicketUpdated(data.ticket);
  }

  @EventPattern('support_sla_breached')
  handleSlaBreached(@Payload() data: { ticket: any }) {
    this.websocketGateway.emitSupportSlaBreached(data.ticket);
  }
}
