import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isBlocking, credentialStanding } from '@hbcfield/shared';
import { readingOf } from './document-read-queue.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  typeScope,
  type RequestContext,
  assertNotOwnReview,
  assertCanIssue,
  eventContext,
} from './document-common';
import { DocumentNotifierService } from './document-notifier.service';

/**
 * The verification queue: a person looks at what a member supplied before it counts.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: DocumentNotifierService,
  ) {}

  /**
   * Everything waiting for somebody to look at it.
   *
   * The whole queue in one query, oldest first — a person waiting on a licence
   * being approved is blocked from work, so the oldest is the most urgent. It
   * carries no URLs: opening the file is a separate, recorded act.
   */
  async listAwaitingVerification(data: { actor: DocumentActor }) {
    assertCanIssue(data.actor);

    const rows = await this.prisma.document.findMany({
      where: {
        // The verification queue is other people's uploads.
        ...typeScope(data.actor),
        organizationId: data.actor.organizationId,
        status: 'PENDING_VERIFICATION',
      },
      select: {
        id: true,
        title: true,
        issuedAt: true,
        expiresOn: true,
        sizeBytes: true,
        mimeType: true,
        scanFormat: true,
        scanVerdict: true,
        scanChecks: true,
        holderName: true,
        documentNumber: true,
        issuingState: true,
        scanData: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        type: {
          select: { id: true, label: true, isCredential: true, requiredForWorkflowIds: true, hasExpiry: true },
        },
      },
      // Indexed on [organizationId, status].
      orderBy: { issuedAt: 'asc' },
      take: 500,
    });

    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      submittedAt: r.issuedAt,
      expiresOn: r.expiresOn,
      sizeBytes: r.sizeBytes,
      mimeType: r.mimeType,
      member: r.user,
      typeId: r.type.id,
      typeLabel: r.type.label,
      isCredential: r.type.isCredential,
      /** Accept needs a date when this is true and `expiresOn` is empty. */
      hasExpiry: r.type.hasExpiry,
      issuingState: r.issuingState,
      /**
       * What the background reader found, for the reviewer to confirm: the date,
       * how sure it is, and where on the document it came from. Null while the
       * document has not been read yet.
       */
      reading: (() => {
        const rd = readingOf(r.scanData);
        return rd
          ? { expiresOn: rd.expiresOn, certainty: rd.certainty, source: rd.source, label: rd.label, unreadable: rd.unreadable }
          : null;
      })(),
      /*
        Whether somebody is WAITING ON THIS to be able to work.

        A licence that gates a task type means this person is out of the pool
        until it is approved — that is a queue item with a cost attached, and it
        should not look like a filing task.
      */
      blocksWork: r.type.requiredForWorkflowIds.length > 0,
      /*
        What the machine made of it, if it was scanned.

        First thing in the row, because it changes what the reviewer is doing:
        CONSISTENT means "confirm this looks like the person"; SUSPECT means
        "here is a specific thing that is wrong". Without it they are squinting
        at a photograph for a changed digit.
      */
      scanFormat: r.scanFormat,
      scanVerdict: r.scanVerdict,
      scanChecks: r.scanChecks,
      holderName: r.holderName,
      documentNumber: r.documentNumber,
      // Approving an already-lapsed certificate would put a green tick on
      // something the gate will still refuse. The reviewer needs to see that.
      standing: r.type.isCredential ? credentialStanding(r.expiresOn, now) : null,
    }));
  }

  /**
   * Accept it. This is the moment it starts counting.
   *
   * The status becomes ISSUED, and that is deliberately the ONLY thing the
   * dispatch gate reads. `verifiedAt` is recorded as an audit fact rather than
   * as a second condition, because a gate that had to check both would be one
   * `AND verifiedAt IS NOT NULL` away from silently failing open — and every
   * administrator-filed document would need a verification it never had.
   */
  async verifyDocument(data: {
    actor: DocumentActor;
    documentId: string;
    /** Supplied here when the member's upload could not be read — "YYYY-MM-DD". */
    expiresOn?: string | null;
    ctx?: RequestContext;
  }) {
    assertCanIssue(data.actor);
    const document = await this.findPendingOr404(data.actor, data.documentId);

    /*
      The expiry is settled HERE, by the person looking at the image.

      A member's upload is no longer refused for want of a date — see the note
      in `fileOwnDocument`. This is the step that catches it: whoever approves
      the document is at a desk with it on screen, and can read the date the
      scanner missed. Approving a credential with no expiry would put it on the
      compliance board as EXPIRY_UNKNOWN and leave it there.
    */
    const suppliedExpiry = data.expiresOn ? new Date(`${data.expiresOn}T12:00:00Z`) : null;
    if (data.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(data.expiresOn)) {
      throw new BadRequestException('That expiry date could not be read');
    }
    if (suppliedExpiry && Number.isNaN(suppliedExpiry.getTime())) {
      throw new BadRequestException('That expiry date could not be read');
    }
    // The same bound the upload applies: a year this far out is a typo, not a certificate.
    if (suppliedExpiry && (suppliedExpiry.getUTCFullYear() > new Date().getUTCFullYear() + 50 || suppliedExpiry.getUTCFullYear() < 1950)) {
      throw new BadRequestException('That expiry date is not plausible');
    }
    if (document.type.hasExpiry && !document.expiresOn && !suppliedExpiry) {
      throw new BadRequestException(`${document.type.label} needs an expiry date before it can be approved`);
    }

    const verifiedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id: document.id },
        data: {
          // A supplied document with a signature mode still has to be signed —
          // approving it decides only that the file is genuine.
          status: isBlocking(document.type.signatureMode) ? 'AWAITING_SIGNATURE' : 'ISSUED',
          verifiedAt,
          verifiedById: data.actor.userId,
          // Only when one was supplied — never overwrite a date already read
          // off the document itself with nothing.
          ...(suppliedExpiry ? { expiresOn: suppliedExpiry } : {}),
          // Cleared, so a resubmission that is approved does not keep showing
          // the reason an earlier one was refused.
          rejectionReason: null,
        },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'VERIFIED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
      return row;
    });

    this.notifier.notifyReviewed(document.id, document.user, document.type.label, true, null);
    return updated;
  }

  /**
   * Refuse it, with a reason the member will read.
   *
   * The reason is REQUIRED. "Rejected" on its own is an instruction to upload
   * the same photograph again, and the second attempt fails for the reason
   * nobody gave — which is how a member ends up unable to work over a blurred
   * corner.
   */
  async rejectDocument(data: {
    actor: DocumentActor;
    documentId: string;
    reason: string;
    ctx?: RequestContext;
  }) {
    assertCanIssue(data.actor);

    const reason = data.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Say why it was not accepted — the member sees this');
    }

    const document = await this.findPendingOr404(data.actor, data.documentId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id: document.id },
        data: { status: 'REJECTED', rejectionReason: reason },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'REJECTED',
          actorId: data.actor.userId,
          meta: { reason },
          ...eventContext(data.ctx),
        },
      });
      return row;
    });

    this.notifier.notifyReviewed(document.id, document.user, document.type.label, false, reason);
    return updated;
  }

  /**
   * A document this caller may review, or a refusal.
   *
   * PENDING_VERIFICATION only. Re-approving something already ISSUED would
   * rewrite `verifiedAt` on a document nobody re-examined, and "rejecting" a
   * payslip the organization issued is not a review — it is a way to make a
   * record disappear from the member's list.
   */
  private async findPendingOr404(actor: DocumentActor, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        // The same scope as the queue it was picked from: approving or refusing
        // a document is reading it, and then acting on it.
        ...typeScope(actor),
        id: documentId,
        organizationId: actor.organizationId,
        status: 'PENDING_VERIFICATION',
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        // `hasExpiry` so verification can insist on a date the reader missed.
        type: { select: { label: true, signatureMode: true, hasExpiry: true } },
      },
    });
    if (!document) throw new NotFoundException('No document is waiting for review');
    assertNotOwnReview(actor, document.userId);
    return document;
  }
}
