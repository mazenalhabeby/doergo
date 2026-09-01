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

  /**
   * A credential is about to lapse.
   *
   * Sent to the member AND to whoever can assign work. Telling only the member
   * is how a certificate lapses anyway: they are on site, while the person who
   * needed to know was planning next month.
   */
  @EventPattern('credential_expiring')
  async handleExpiring(
    @Payload()
    data: {
      documentId: string;
      organizationId: string;
      userId: string;
      userName: string;
      credential: string;
      daysLeft: number;
      expiresOn: string;
      /** Resolved by the producer; falls back to the member alone. */
      recipientIds?: string[];
    },
  ) {
    this.logger.log(
      `Credential expiring: ${data.credential} for ${data.userName} in ${data.daysLeft}d`,
    );

    const body = `${data.credential} expires on ${data.expiresOn}`;
    const payload = { ...data, timestamp: new Date().toISOString() };

    // The member first: it is their certificate to renew.
    this.websocketGateway.emitToUser(data.userId, 'credential_expiring', payload);
    await this.push(data.userId, `Your ${data.credential} expires soon`, body, data.documentId);

    // Then whoever schedules them. Deduplicated, in case they are the same
    // person — a manager warned twice about their own certificate.
    for (const id of new Set((data.recipientIds ?? []).filter((r) => r && r !== data.userId))) {
      this.websocketGateway.emitToUser(id, 'credential_expiring', payload);
      await this.push(
        id,
        `${data.userName}: ${data.credential} expires soon`,
        `${body}. They will drop out of scheduling for jobs that need it.`,
        data.documentId,
      );
    }
  }

  /** Push, and never let a failure escape — the sweep must finish. */
  private async push(userId: string, title: string, body: string, documentId: string) {
    try {
      await this.pushService.sendToUser(userId, title, body, {
        type: 'credential_expiring',
        documentId,
      });
    } catch (error) {
      this.logger.error(`Could not push to ${userId}: ${error}`);
    }
  }

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

  /**
   * A member has sent something in for review.
   *
   * To the reviewers, not to the member — they know; they just did it. The
   * point of the message is that somebody is now WAITING, and for a certificate
   * that gates work they are waiting to be allowed to work at all.
   *
   * Recipients are resolved by the producer, which owns the permission model.
   * This handler stays a delivery mechanism rather than growing a second copy
   * of "who is allowed to review".
   */
  /**
   * The chain has moved, and it is now somebody's turn.
   *
   * This is the message that makes a multi-party document work at all. Without
   * it the next signer learns a document is waiting only by opening the app and
   * looking — which nobody does — and a time sheet sits unsigned while everyone
   * involved believes it moved on.
   *
   * Deliberately NOT the same message as `document_issued`. That one tells the
   * subject a document about them exists; this one tells somebody else that
   * work has arrived on their desk, about a person who is not them. Naming the
   * member is the whole content of it.
   */
  @EventPattern('document_awaiting_signature')
  async handleAwaitingSignature(
    @Payload()
    data: {
      documentId: string;
      userId: string;
      email?: string;
      firstName?: string;
      title: string;
      memberName?: string;
      step?: number;
      totalSteps?: number;
    },
  ) {
    this.logger.log(
      `Signature needed: doc=${data.documentId} → user=${data.userId} (step ${data.step ?? '?'}/${data.totalSteps ?? '?'})`,
    );

    const payload = {
      documentId: data.documentId,
      title: data.title,
      memberName: data.memberName ?? null,
      step: data.step ?? null,
      totalSteps: data.totalSteps ?? null,
      timestamp: new Date().toISOString(),
    };

    this.websocketGateway.emitToUser(data.userId, 'document_awaiting_signature', payload);

    try {
      await this.pushService.sendToUser(
        data.userId,
        'Your signature is needed',
        // Whose document it is, because that is what tells the recipient
        // whether it is theirs to sign and how urgent it is.
        data.memberName
          ? `${data.title} — ${data.memberName} is waiting for you to sign`
          : `${data.title} is waiting for your signature`,
        { type: 'document_awaiting_signature', documentId: data.documentId },
      );
    } catch (error) {
      // Never rethrow: the step advanced whether or not the phone was
      // reachable, and the register shows it waiting either way.
      this.logger.error(`Could not push signature request ${data.documentId} to ${data.userId}: ${error}`);
    }
  }

  @EventPattern('document_submitted')
  async handleSubmitted(
    @Payload()
    data: {
      documentId: string;
      organizationId: string;
      memberId: string;
      memberName: string;
      typeLabel: string;
      title: string;
      recipientIds?: string[];
    },
  ) {
    this.logger.log(`Document submitted: ${data.typeLabel} by ${data.memberName}`);

    const payload = {
      documentId: data.documentId,
      memberId: data.memberId,
      memberName: data.memberName,
      typeLabel: data.typeLabel,
      timestamp: new Date().toISOString(),
    };

    // Deduplicated, and never back to the person who uploaded it: a reviewer
    // filing their own certificate should not be told about their own act.
    for (const id of new Set((data.recipientIds ?? []).filter((r) => r && r !== data.memberId))) {
      this.websocketGateway.emitToUser(id, 'document_submitted', payload);
      await this.pushSafely(
        id,
        'A document needs checking',
        `${data.memberName} sent in a ${data.typeLabel}`,
        'document_submitted',
        data.documentId,
      );
    }
  }

  /**
   * Their upload was accepted, or it was not.
   *
   * The reason travels IN the message when it was refused. A refusal that only
   * says "not accepted" sends somebody back to upload the same photograph, and
   * one they have to open the app to understand is one they act on a day later.
   */
  @EventPattern('document_reviewed')
  async handleReviewed(
    @Payload()
    data: {
      documentId: string;
      userId: string;
      firstName?: string;
      typeLabel: string;
      accepted: boolean;
      reason?: string | null;
    },
  ) {
    this.logger.log(
      `Document reviewed: ${data.typeLabel} → ${data.accepted ? 'accepted' : 'refused'}`,
    );

    const payload = {
      documentId: data.documentId,
      typeLabel: data.typeLabel,
      accepted: data.accepted,
      reason: data.reason ?? null,
      timestamp: new Date().toISOString(),
    };
    this.websocketGateway.emitToUser(data.userId, 'document_reviewed', payload);

    await this.pushSafely(
      data.userId,
      data.accepted ? `${data.typeLabel} accepted` : `${data.typeLabel} not accepted`,
      data.accepted
        ? 'It is on your file and counts from now'
        : data.reason || 'Open the app to see why and send a new one',
      'document_reviewed',
      data.documentId,
    );
  }

  /** Push, swallowing failure — a delivery problem must not undo a decision. */
  private async pushSafely(
    userId: string,
    title: string,
    body: string,
    type: string,
    documentId: string,
  ) {
    try {
      await this.pushService.sendToUser(userId, title, body, { type, documentId });
    } catch (error) {
      this.logger.error(`Could not push ${type} for ${documentId} to ${userId}: ${error}`);
    }
  }
}
