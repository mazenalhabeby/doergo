import { Inject, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { personName, canSignInApp, nextPendingStep, chainProgress } from '@hbcfield/shared';
import { signatureKey, sha256 } from '@hbcfield/shared/storage';
import {
  type DocumentActor,
  type RequestContext,
  CONSENT_TEXT,
  decodeSignaturePng,
  eventContext,
} from './document-common';
import { DocumentSigningBase } from './document-signing.base';
import { DocumentSealService } from './document-seal.service';

/**
 * Signing, step by step: consent, the signature itself, the sealed copy, and
 * sending a document back.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentSigningService extends DocumentSigningBase {
  @Inject(DocumentSealService) private readonly seal!: DocumentSealService;

  /**
   * Record that the member agreed to sign electronically.
   *
   * Its own act, and its own event, deliberately separate from the signature.
   * eIDAS treats consent to the electronic form as a distinct thing from the
   * signature itself, and a trail that conflates them cannot show that the
   * signer was told what they were doing before they did it.
   */
  async recordConsent(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    const document = await this.findSignableOr404(data.actor, data.documentId);
    await this.prisma.documentEvent.create({
      data: {
        documentId: document.id,
        type: 'CONSENTED',
        actorId: data.actor.userId,
        meta: { text: CONSENT_TEXT },
        ...eventContext(data.ctx),
      },
    });
    return { consentText: CONSENT_TEXT, consentAt: new Date() };
  }

  /**
   * Sign a document, seal it, and freeze it.
   *
   * Idempotent by key: a dropped connection on a phone in a plant room must
   * return the existing seal, never sign a second time. Everything after the
   * signature is made runs in one transaction.
   */
  async signDocument(data: {
    actor: DocumentActor;
    documentId: string;
    /** PNG data URL from the signature pad. */
    signatureImage: string;
    idempotencyKey: string;
    sessionAuthenticatedAt?: string | null;
    ctx?: RequestContext;
  }) {
    if (!data.idempotencyKey || data.idempotencyKey.length < 8) {
      throw new BadRequestException('A signing request needs an idempotency key');
    }

    // Answered before anything else: this is the retry path, and it must be
    // cheap and side-effect free.
    const existing = await this.prisma.documentSignature.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: { document: { select: { id: true, organizationId: true, status: true } } },
    });
    if (existing) {
      if (existing.document.organizationId !== data.actor.organizationId) {
        // Say nothing about whose it is: the key is simply taken.
        throw new ConflictException('That idempotency key has already been used — send the request with a new one');
      }
      return { documentId: existing.documentId, alreadySigned: true, sealedAt: existing.sealedAt };
    }

    /*
      Authorization first, storage second — the same ordering getDownloadUrl
      states and this path did not follow. With it reversed, somebody signing
      out of turn was told "storage is not configured" instead of being told
      whose turn it is, and a misconfigured server answered the wrong question
      to every caller.
    */
    const document = await this.findSignableOr404(data.actor, data.documentId);
    const store = this.storage.requireStore();

    if (!canSignInApp(document.type.signatureMode)) {
      // WET_INK exists for contract types the law excludes from electronic
      // form. Refusing is the whole point: producing something that looks
      // signed and is not would be worse than not offering it.
      throw new BadRequestException(
        document.type.signatureMode === 'WET_INK'
          ? 'This document must be signed on paper.'
          : 'This document does not take a signature.',
      );
    }

    const png = decodeSignaturePng(data.signatureImage);
    const signatureHash = sha256(png);
    const sigKey = signatureKey(data.actor.organizationId, signatureHash);
    await this.storage.withStorage('storing the signature', () => store.put(sigKey, png, 'image/png'));

    // The person signing NOW. Not document.user — that is who the document is
    // ABOUT, and from step two onwards they are not the one holding the pen.
    const signerUser = await this.prisma.user.findFirst({
      where: { id: data.actor.userId, organizationId: data.actor.organizationId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!signerUser) throw new NotFoundException('Signer not found');

    /*
      Whose step this was, and whether it was the last.

      Read before the seal so the status written inside it is decided from the
      chain rather than assumed. A document with no route has no steps and
      finishes on its only signature, exactly as it always did.
    */
    const steps = await this.lookup.signerSteps(document.id);
    const currentStep = nextPendingStep(steps);
    const isLastStep =
      steps.length === 0 ||
      chainProgress(
        steps.map((s) =>
          s.order === currentStep?.order ? { ...s, status: 'SIGNED' as const } : s,
        ),
      ).complete;
    const signerRow = currentStep
      ? await this.prisma.documentSigner.findFirst({
          where: { documentId: document.id, order: currentStep.order },
          select: { id: true },
        })
      : null;

    const sealed = await this.seal.sealAndRecord({
      document,
      organizationId: data.actor.organizationId,
      signer: {
        kind: 'user',
        userId: data.actor.userId,
        name: personName(signerUser),
        email: signerUser.email,
        sessionAuthenticatedAt: data.sessionAuthenticatedAt
          ? new Date(data.sessionAuthenticatedAt)
          : null,
      },
      png,
      signatureHash,
      sigKey,
      currentStep,
      signerRowId: signerRow?.id ?? null,
      isLastStep,
      idempotencyKey: data.idempotencyKey,
      ctx: data.ctx,
    });

    /*
      Hand the document on.

      AFTER the seal commits, never inside it: telling somebody a document is
      waiting for them and then rolling back the signature that made it their
      turn is worse than not telling them.

      A failure here does not undo the step. The chain has genuinely advanced
      and the register shows it waiting on the right person — a stalled chain
      that LOOKS moved is the dangerous version, not one that moved quietly.
    */
    if (!isLastStep) {
      await this.notifier.notifyNextSigner(document.id, document.title);
    }

    return { documentId: document.id, alreadySigned: false, sealedAt: sealed.sealedAt };
  }

  /**
   * "I have read this" — an attestation of receipt, not of agreement.
   *
   * Weaker than a signature and honest about being weaker: no drawing, no seal,
   * no certificate. It exists because a safety policy needs proof somebody saw
   * it, and asking for a signature on one devalues the signatures that matter.
   */
  async acknowledgeDocument(data: {
    actor: DocumentActor;
    documentId: string;
    ctx?: RequestContext;
  }) {
    const document = await this.findSignableOr404(data.actor, data.documentId);
    if (document.type.signatureMode !== 'ACKNOWLEDGE') {
      throw new BadRequestException('This document needs a signature, not an acknowledgement.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id: document.id }, data: { status: 'ISSUED' } });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'ACKNOWLEDGED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
    });
    return { success: true };
  }
}
