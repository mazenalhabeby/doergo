import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { nextPendingStep, maySignStep, PERSON_BRIEF_SELECT } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { type DocumentActor } from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';

/**
 * What the signing services share: their dependencies, and finding a document the
 * caller may act on (404 otherwise).
 */
@Injectable()
export abstract class DocumentSigningBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly storage: DocumentStorageService,
    protected readonly lookup: DocumentLookupService,
    protected readonly notifier: DocumentNotifierService,
  ) {}

  /**
   * A document this caller may sign, or a refusal.
   *
   * SELF ONLY, and not negotiable. No permission grants the right to sign on
   * somebody else's behalf — that is the one thing a signature cannot survive,
   * and there is deliberately no flag anywhere that could be set to allow it.
   */
  /**
   * The document this caller may sign right now, and the step they are signing.
   *
   * Two shapes, and the difference is the whole of Phase 2:
   *
   *   NO ROUTE   the document's own member signs it, and nobody else. This is
   *              every document issued before routes existed and every type
   *              that never gets one, so it is scoped in the WHERE clause as
   *              before — a colleague's id is NOT FOUND rather than refused.
   *
   *   A ROUTE    the person being waited on signs it, who is usually not the
   *              document's subject. Their manager signing a time sheet is the
   *              entire point. Turn is decided by the chain, so the query
   *              cannot be scoped to the caller and the refusal is explicit.
   *
   * Signing out of turn is refused rather than queued. A signature means "I
   * agree with what is above my name", and above the manager's name is supposed
   * to be the worker's signature — collecting them in any order would make the
   * order on the page a decoration.
   */
  protected async findSignableOr404(actor: DocumentActor, documentId: string) {
    const steps = await this.lookup.signerSteps(documentId);

    if (steps.length > 0) {
      const next = nextPendingStep(steps);
      if (!next) throw new BadRequestException('This document has already been signed.');
      if (!maySignStep(next, actor.userId)) {
        throw new ForbiddenException('This document is waiting for somebody else to sign.');
      }
    }

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: actor.organizationId,
        // With a route, turn decides who may sign and the chain was just
        // checked. Without one, the caller must be the subject — scoped here so
        // a colleague's id is not found rather than found-and-refused.
        ...(steps.length > 0 ? {} : { userId: actor.userId }),
        // Hidden from its member means not signable by them either — whatever
        // the route says. Another signer on the route is unaffected.
        NOT: { userId: actor.userId, hiddenFromMember: true },
      },
      include: {
        type: { select: { label: true, signatureMode: true } },
        user: { select: PERSON_BRIEF_SELECT },
        organization: { select: { name: true } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (document.status === 'SIGNED') {
      throw new BadRequestException('This document has already been signed.');
    }
    if (document.status !== 'AWAITING_SIGNATURE') {
      throw new BadRequestException('This document is not waiting for a signature.');
    }
    return document;
  }
}
