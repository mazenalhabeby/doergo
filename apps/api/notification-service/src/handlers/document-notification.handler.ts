import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { msg, verbatim, type LocalizedText } from '../i18n/translate';

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

    const facts = { credential: data.credential, date: data.expiresOn, name: data.userName };
    const payload = { ...data, timestamp: new Date().toISOString() };

    // The member first: it is their certificate to renew.
    this.websocketGateway.emitToUser(data.userId, 'credential_expiring', payload);
    await this.pushSafely(
      [data.userId],
      { title: msg('doc.expiring.selfTitle', facts), body: msg('doc.expiring.selfBody', facts) },
      'credential_expiring',
      data.documentId,
    );

    // Then whoever schedules them. Deduplicated, in case they are the same
    // person — a manager warned twice about their own certificate.
    const others = [...new Set((data.recipientIds ?? []).filter((r) => r && r !== data.userId))];
    for (const id of others) this.websocketGateway.emitToUser(id, 'credential_expiring', payload);
    await this.pushSafely(
      others,
      { title: msg('doc.expiring.otherTitle', facts), body: msg('doc.expiring.otherBody', facts) },
      'credential_expiring',
      data.documentId,
    );
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
        data.needsSignature
          ? { title: msg('doc.issued.signTitle'), body: msg('doc.issued.signBody', { title: data.title }) }
          : {
              title: msg('doc.issued.availableTitle', { type: data.typeLabel }),
              body: msg('doc.issued.availableBody', { title: data.title }),
            },
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
        {
          title: msg('doc.awaiting.title'),
          // Whose document it is, because that is what tells the recipient
          // whether it is theirs to sign and how urgent it is.
          body: data.memberName
            ? msg('doc.awaiting.bodyMember', { title: data.title, name: data.memberName })
            : msg('doc.issued.signBody', { title: data.title }),
        },
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
    const reviewers = [...new Set((data.recipientIds ?? []).filter((r) => r && r !== data.memberId))];
    for (const id of reviewers) this.websocketGateway.emitToUser(id, 'document_submitted', payload);
    await this.pushSafely(
      reviewers,
      {
        title: msg('doc.submitted.title'),
        body: msg('doc.submitted.body', { name: data.memberName, type: data.typeLabel }),
      },
      'document_submitted',
      data.documentId,
    );
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

    const type = { type: data.typeLabel };
    await this.pushSafely(
      [data.userId],
      data.accepted
        ? { title: msg('doc.reviewed.titleAccepted', type), body: msg('doc.reviewed.bodyAccepted') }
        : {
            title: msg('doc.reviewed.titleRejected', type),
            body: data.reason ? verbatim(data.reason) : msg('doc.reviewed.bodyRejected'),
          },
      'document_reviewed',
      data.documentId,
    );
  }

  /**
   * Push, swallowing failure — a delivery problem must not undo a decision, and
   * the expiry sweep must finish.
   */
  private async pushSafely(userIds: string[], text: LocalizedText, type: string, documentId: string) {
    if (userIds.length === 0) return;
    try {
      await this.pushService.sendToUsers(userIds, text, { type, documentId });
    } catch (error) {
      this.logger.error(`Could not push ${type} for ${documentId}: ${error}`);
    }
  }
}
