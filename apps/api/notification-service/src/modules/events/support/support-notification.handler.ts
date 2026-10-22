import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  supportMessageEvent,
  supportSlaBreachedEvent,
  supportTicketCreatedEvent,
  supportTicketUpdatedEvent,
} from '@hbcfield/shared/microservices';
import { PushService } from '../../push/push.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { msg, verbatim } from '../../../i18n/translate';

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

  @EventPattern(eventPattern(supportTicketCreatedEvent))
  async handleCreated(@Payload() data: EventPayload<typeof supportTicketCreatedEvent>) {
    this.logger.log(`Support ticket created: ${data.ticket?.id}`);
    // Surface the new ticket + its first message in every agent inbox.
    this.websocketGateway.emitSupportTicketUpdated(data.ticket);
  }

  @EventPattern(eventPattern(supportMessageEvent))
  async handleMessage(
    @Payload()
    data: EventPayload<typeof supportMessageEvent>,
  ) {
    this.websocketGateway.emitSupportMessage(data);
    // Push the customer when an agent (not an internal note) replies.
    if (!data.isInternalNote && data.message?.authorType === 'AGENT') {
      try {
        await this.pushService.sendToUser(
          data.customerId,
          // The agent's words go out as written; only the frame is translated.
          { title: msg('support.replied.title'), body: verbatim(data.message.body, 120) },
          { type: 'support', ticketId: data.ticketId },
        );
      } catch (e) {
        this.logger.error(`support push failed: ${(e as Error).message}`);
      }
    }
  }

  @EventPattern(eventPattern(supportTicketUpdatedEvent))
  handleUpdated(@Payload() data: EventPayload<typeof supportTicketUpdatedEvent>) {
    this.websocketGateway.emitSupportTicketUpdated(data.ticket);
  }

  @EventPattern(eventPattern(supportSlaBreachedEvent))
  handleSlaBreached(@Payload() data: EventPayload<typeof supportSlaBreachedEvent>) {
    this.websocketGateway.emitSupportSlaBreached(data.ticket);
  }
}
