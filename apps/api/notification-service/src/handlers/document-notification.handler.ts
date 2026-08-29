import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

/**
 * Telling a member a document is waiting for them.
 *
 * This is not a courtesy ping. German law, when it allowed employment terms to
 * be issued electronically, required that they be made PERMANENTLY AVAILABLE to
 * the employee and that a link alone does not suffice — so the notification is
 * part of how delivery is evidenced, not decoration on top of it.
 *
 * Push and socket only. No email body carries the document or a link to it: an
 * inbox is not a place to put somebody's payslip, and a link in an email is a
 * capability that outlives the message.
 */
@Controller()
export class DocumentNotificationHandler {
  private readonly logger = new Logger('DocumentNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('document_issued')
  async handleIssued(
    @Payload()
    data: {
      documentId: string;
      userId: string;
      email?: string;
      firstName?: string;
      typeLabel: string;
      title: string;
      needsSignature?: boolean;
    },
  ) {
    this.logger.log(`Document issued: ${data.typeLabel} → user=${data.userId}`);

    const payload = {
      documentId: data.documentId,
      typeLabel: data.typeLabel,
      title: data.title,
      needsSignature: !!data.needsSignature,
      timestamp: new Date().toISOString(),
    };

    // Socket first: a member with the app open sees the row appear without a
    // pull-to-refresh, and this costs nothing when they do not.
    this.websocketGateway.emitToUser(data.userId, 'document_issued', payload);

    try {
      await this.pushService.sendToUser(
        data.userId,
        // Two different messages, because they ask for two different things.
        // "Needs your signature" is an instruction; "is ready" is information,
        // and conflating them trains people to ignore both.
        data.needsSignature ? 'Signature needed' : `${data.typeLabel} available`,
        data.needsSignature
          ? `${data.title} is waiting for your signature`
          : `${data.title} is now in your documents`,
        { type: 'document_issued', documentId: data.documentId },
      );
    } catch (error) {
      // Never rethrow. The document exists whether or not the phone was
      // reachable, and a failed push must not make the issuer think otherwise.
      this.logger.error(`Could not push document ${data.documentId} to ${data.userId}: ${error}`);
    }
  }
}
