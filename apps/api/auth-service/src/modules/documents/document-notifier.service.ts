import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SERVICE_NAMES,
  Role,
  nextPendingStep,
  ORG_ACCESS_SELECT,
  orgAllows,
} from '@hbcfield/shared';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentLookupService } from './document-lookup.service';

/**
 * Telling people about documents. Every notice is fire-and-forget: a queue that
 * is down must never undo a document that was filed or signed.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentNotifierService {
  private readonly logger = new Logger(DocumentNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly lookup: DocumentLookupService,
  ) {}

  /**
   * Tell whoever reviews documents that one is waiting.
   *
   * Fire-and-forget, like every other notification here: an upload that
   * succeeded must not be undone because a queue was down. The document is in
   * the review list either way, which is the durable half.
   */
  async notifySubmitted(
    documentId: string,
    organizationId: string,
    member: { id: string; firstName: string; lastName: string; email: string },
    typeLabel: string,
    title: string,
  ) {
    try {
      /*
        The recipients are resolved HERE, not in the notification service.

        Same shape as the credential reminders: the producer owns the database
        and the permission model, so the handler stays a delivery mechanism
        rather than growing a second copy of "who is allowed to review".
      */
      const candidates = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          // Narrowed in SQL to the people who could plausibly hold it — the
          // owner, or anybody with a member role at all — so the resolve below
          // runs over a handful of rows rather than the whole company.
          OR: [{ role: Role.ADMIN }, { memberRoleId: { not: null } }],
        },
        // Everything the access rule reads — the role's isActive included.
        select: { id: true, ...ORG_ACCESS_SELECT },
      });

      /*
        `canIssueDocuments` is NOT a column.

        It lives in the unified access model — a member role's permissions JSON,
        merged over the legacy user flags — so it cannot be filtered in SQL, and
        an approximation like `canManageUsers: true` would silently miss anybody
        granted the document permission on its own. Resolved with the same
        helper the request path uses, so this list and the guard agree.
      */
      // Same rule as the request path (memberAccessOf): an admin holds every
      // permission by being one; an inactive role grants nothing.
      const reviewers = candidates.filter((u) => orgAllows(u, 'canIssueDocuments'));

      this.notificationClient.emit('document_submitted', {
        documentId,
        organizationId,
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        typeLabel,
        title,
        // Deduplicated by the handler; a reviewer uploading their own
        // certificate should not be told about it.
        recipientIds: reviewers.map((r) => r.id),
      });
    } catch (err) {
      this.logger.warn(
        `Could not queue submission notice for document ${documentId}: ${(err as Error).message}`,
      );
    }
  }

  /** Tell the member what happened to what they sent. */
  notifyReviewed(
    documentId: string,
    member: { id: string; firstName: string; lastName: string; email: string },
    typeLabel: string,
    accepted: boolean,
    reason: string | null,
  ) {
    try {
      this.notificationClient.emit('document_reviewed', {
        documentId,
        userId: member.id,
        email: member.email,
        firstName: member.firstName,
        typeLabel,
        accepted,
        // Carried into the message itself: a refusal the member has to open the
        // app to understand is a refusal they act on a day later.
        reason,
      });
    } catch (err) {
      this.logger.warn(
        `Could not queue review notice for document ${documentId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Tell the member a document is waiting.
   *
   * Fire-and-forget: a notification service that is down must not fail the
   * issue. The document exists either way, and delivery is recorded separately
   * — which is why `deliveredAt` is set by the notification path, not here.
   */
  /**
   * Tell whoever the document is now waiting for.
   *
   * Marks the step notified so the register can say how long it has been
   * sitting — "waiting on Anna, 4 days" is the question that screen exists to
   * answer, and it needs a start time.
   *
   * Swallows its own failure. Push is best-effort, and an exception here would
   * surface to the signer as though their signature had failed when it is
   * already sealed.
   */
  async notifyNextSigner(documentId: string, title: string): Promise<void> {
    try {
      const steps = await this.lookup.signerSteps(documentId);
      const next = nextPendingStep(steps);
      if (!next) return;

      /*
        A client is told by email, not by push.

        They have no device registered here and no socket open — the only way to
        reach them is the address on their record. Marking them as owing a
        notification rather than sending one here is what makes eleven time
        sheets issued at 09:00 arrive as ONE email: the sweep collects
        everything outstanding per client and sends once.
      */
      if (!next.userId && next.customerId) {
        await this.prisma.documentSigner.updateMany({
          where: { documentId, order: next.order, notifiedAt: null },
          data: { notifiedAt: new Date() },
        });
        return;
      }

      /*
        Tell EVERYONE the step is open to.

        A step with three eligible leaders is waiting on all three until one of
        them acts, so telling only the first would make the other two wonder why
        a document appeared on their list unannounced — and would quietly make
        the first person the responsible after all.
      */
      const audience = next.eligibleUserIds?.length
        ? next.eligibleUserIds
        : next.userId
        ? [next.userId]
        : [];
      if (audience.length === 0) return; // A step nobody can be told about.

      const [users, signerRow, document] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: audience } },
          select: { id: true, firstName: true, email: true },
        }),
        this.prisma.documentSigner.findFirst({
          where: { documentId, order: next.order },
          select: { id: true },
        }),
        // Whose document it is. "A time sheet needs your signature" is not
        // actionable to a manager with nine people; "Mike's time sheet" is.
        this.prisma.document.findUnique({
          where: { id: documentId },
          select: { user: { select: { firstName: true, lastName: true } } },
        }),
      ]);
      if (users.length === 0) return;

      if (signerRow) {
        await this.prisma.documentSigner.update({
          where: { id: signerRow.id },
          data: { notifiedAt: new Date() },
        });
      }

      for (const user of users) this.notificationClient.emit('document_awaiting_signature', {
        documentId,
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        title,
        memberName: document?.user
          ? `${document.user.firstName} ${document.user.lastName}`.trim()
          : undefined,
        step: next.order,
        totalSteps: steps.length,
      });
    } catch (err) {
      this.logger.warn(`Could not notify the next signer of ${documentId}: ${String(err)}`);
    }
  }

  notifyIssued(
    documentId: string,
    member: { id: string; firstName: string; lastName: string; email: string },
    typeLabel: string,
    title: string,
    needsSignature: boolean,
  ) {
    try {
      this.notificationClient.emit('document_issued', {
        documentId,
        userId: member.id,
        email: member.email,
        firstName: member.firstName,
        typeLabel,
        title,
        // The handler sends a different message for each: "needs your
        // signature" is an instruction, "is ready" is information, and
        // conflating them trains people to ignore both.
        needsSignature,
      });
    } catch (err) {
      this.logger.warn(`Could not queue notification for document ${documentId}: ${(err as Error).message}`);
    }
  }
}
