import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  chatBadgeEvent,
  chatMembersChangedEvent,
  chatMessageChangedEvent,
  chatMessageEvent,
  chatReadEvent,
} from '@hbcfield/shared/microservices';
import { personName, messagePreview } from '@hbcfield/shared';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { msg, verbatim } from '../i18n/translate';

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

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

  @EventPattern(eventPattern(chatMessageEvent))
  async handleMessage(
    @Payload()
    data: EventPayload<typeof chatMessageEvent>,
  ) {
    this.websocketGateway.emitChatMessage(data);
    if (data.silent) return;
    /*
      A push only where it adds something: not to somebody who muted the
      thread, and not to somebody reading it right now (the socket already
      drew it). The title is the sender's name and the body their words (or the
      file's name) — neither is translated; only the no-sender fallback is.
    */
    const muted = new Set(ids(data.muted));
    const to = ids(data.recipients).filter(
      (uid) => !muted.has(uid) && !this.websocketGateway.isViewingConversation(uid, data.conversationId),
    );
    if (to.length === 0) return;
    const sender = data.message?.sender;
    const senderName = sender ? personName(sender) : '';
    try {
      await this.pushService.sendToUsers(
        to,
        {
          title: senderName ? verbatim(senderName) : msg('chat.newMessage'),
          // The attachments column is written as an array of files; the preview reads only [0].fileName.
          body: verbatim(
            messagePreview(
              data.message?.body,
              data.message?.attachments as ReadonlyArray<{ fileName?: string }> | null,
            ),
            120,
          ),
        },
        { type: 'chat', conversationId: data.conversationId },
      );
    } catch (e) {
      this.logger.error(`chat push failed: ${(e as Error).message}`);
    }
  }

  /** A thread was read: the reader's other screens drop their badge to the new total. */
  @EventPattern(eventPattern(chatBadgeEvent))
  handleBadge(@Payload() data: EventPayload<typeof chatBadgeEvent>) {
    if (typeof data?.userId === 'string' && Number.isInteger(data.total))
      this.websocketGateway.emitChatBadge(data.userId, data.total);
  }

  /** "Read" for the others in the thread. */
  @EventPattern(eventPattern(chatReadEvent))
  handleRead(@Payload() data: EventPayload<typeof chatReadEvent>) {
    if (typeof data?.conversationId !== 'string' || typeof data.userId !== 'string') return;
    this.websocketGateway.emitChatRead(ids(data.memberIds), {
      conversationId: data.conversationId,
      userId: data.userId,
      at: data.at,
    });
  }

  /** A group changed or a job's crew moved: forget the cached members, refresh each list. */
  @EventPattern(eventPattern(chatMembersChangedEvent))
  handleMembersChanged(@Payload() data: EventPayload<typeof chatMembersChangedEvent>) {
    if (typeof data?.conversationId !== 'string') return;
    this.websocketGateway.emitChatMembersChanged(data.conversationId, ids(data.userIds), ids(data.removedIds));
  }

  /** An edit or a removal reaches every member's screen. */
  @EventPattern(eventPattern(chatMessageChangedEvent))
  handleChanged(@Payload() data: EventPayload<typeof chatMessageChangedEvent>) {
    if (typeof data?.conversationId !== 'string') return;
    this.websocketGateway.emitChatMessageChanged(ids(data.memberIds), {
      conversationId: data.conversationId,
      message: data.message,
    });
  }
}
