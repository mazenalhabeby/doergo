import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canSignInApp,
  nextPendingStep,
  maySignStep,
  signatureStrength,
  chainProgress,
  type SignerStep,
  PERSON_BRIEF_SELECT,
} from '@hbcfield/shared';
import { documentKey, signatureKey, sha256 } from '@hbcfield/shared/storage';
import { sealSignedPdf } from './contract-pdf';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  assertTypeVisible,
  assertNotHiddenDraft,
  type RequestContext,
  type SealSigner,
  CONSENT_TEXT,
  decodeSignaturePng,
  roleLabel,
  eventContext,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';

/**
 * Signing, step by step: consent, the signature itself, the sealed copy, and
 * sending a document back.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentSigningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
    private readonly notifier: DocumentNotifierService,
  ) {}

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

    const sealed = await this.sealAndRecord({
      document,
      organizationId: data.actor.organizationId,
      signer: {
        kind: 'user',
        userId: data.actor.userId,
        name: `${signerUser.firstName} ${signerUser.lastName}`.trim(),
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
   * Attach one signature to one document, re-seal it, and record the act.
   *
   * Extracted from `signDocument` so a CLIENT signing eleven time sheets in one
   * sitting walks exactly the same path eleven times instead of a second copy
   * of it. The two callers differ only in WHO is signing — everything that
   * makes a signature evidence (the tamper gate, the chain of hashes, the
   * re-render from the original, the events) is here and is the same for both.
   *
   * The signature PNG is deliberately NOT uploaded here. Keys are
   * content-addressed, so one drawing applied to eleven documents is one object
   * — the caller stores it once and passes the key in.
   */
  async sealAndRecord(params: {
    document: {
      id: string;
      title: string;
      storageKey: string;
      sha256: string;
      originalKey: string | null;
      organization?: { name: string } | null;
    };
    organizationId: string;
    signer: SealSigner;
    png: Buffer;
    signatureHash: string;
    sigKey: string;
    currentStep: SignerStep | null;
    signerRowId: string | null;
    isLastStep: boolean;
    idempotencyKey: string;
    ctx?: RequestContext;
    /** Set when this signature is one of several made in a single sitting. */
    batchId?: string | null;
  }): Promise<{ hashBefore: string; hashAfter: string; sealedAt: Date }> {
    const { document, signer } = params;
    const store = this.storage.requireStore();

    // The document as the signer read it. Fetched and hashed here rather than
    // trusting the stored value, so an object swapped underneath us is caught
    // BEFORE a signature is attached to it.
    const currentBytes = await this.storage.withStorage('reading the document to sign', () =>
      store.get(document.storageKey),
    );
    const hashBefore = sha256(currentBytes);
    if (hashBefore !== document.sha256) {
      throw new BadRequestException(
        'This document has changed since it was issued and cannot be signed. Please contact your administrator.',
      );
    }

    // Always re-rendered from the ORIGINAL, never appended to the last seal —
    // which is what keeps three signers to one signature block and one
    // certificate instead of six pages.
    const baseBytes = document.originalKey
      ? await this.storage.withStorage('reading the original document', () =>
          store.get(document.originalKey as string),
        )
      : currentBytes;

    const consentAt = new Date();
    const signedAt = new Date();

    const previous = await this.prisma.documentSignature.findMany({
      where: { documentId: document.id },
      orderBy: { signedAt: 'asc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        customer: { select: { name: true, email: true } },
        signer: { select: { role: true, userId: true, customerId: true } },
      },
    });

    const priorSigners = await Promise.all(
      previous.map(async (s) => ({
        role: roleLabel(s.signer?.role ?? null),
        signerName:
          s.signerName ??
          (s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : s.customer?.name ?? ''),
        signerEmail: s.user?.email ?? s.customer?.email ?? '',
        consentText: s.consentText,
        consentAt: s.consentAt,
        signedAt: s.signedAt,
        hashBefore: s.hashBefore,
        // Provenance for an earlier signature lives on its own event row; the
        // certificate reprints what was recorded then, never today's request.
        ...(s.userId ? await this.signatureContext(s.userId, document.id) : {}),
        signatureImage: await this.storage.withStorage('reading a signature', () => store.get(s.signatureKey)),
        signatureSha256: s.signatureSha256,
        /*
          What that signature was worth, honestly.

          This was hardcoded 'SESSION' on both branches, so the certificate has
          never once been able to say a signature came from a link — the
          renderer has printed that distinction since the day it was written and
          nothing ever asked it to. A reader who catches one line overstating
          itself has no reason to trust the others.
        */
        strength: signatureStrength({ userId: s.userId }),
      })),
    );

    const sealed = await sealSignedPdf(baseBytes, {
      documentTitle: document.title,
      organizationName: document.organization?.name ?? '',
      signers: [
        ...priorSigners,
        {
          role: roleLabel(params.currentStep?.role ?? null),
          signerName: signer.name,
          signerEmail: signer.email ?? '',
          consentText: CONSENT_TEXT,
          consentAt,
          signedAt,
          hashBefore,
          sessionAuthenticatedAt:
            signer.kind === 'user' ? signer.sessionAuthenticatedAt ?? null : null,
          ip: params.ctx?.ip ?? null,
          userAgent: params.ctx?.userAgent ?? null,
          appVersion: params.ctx?.appVersion ?? null,
          lat: params.ctx?.lat ?? null,
          lng: params.ctx?.lng ?? null,
          signatureImage: params.png,
          signatureSha256: params.signatureHash,
          strength: signer.kind === 'user' ? 'SESSION' : 'LINK',
        },
      ],
    });

    const hashAfter = sha256(sealed);
    const sealedKey = documentKey(params.organizationId, hashAfter, 'pdf');
    await this.storage.withStorage('sealing the document', () => store.put(sealedKey, sealed, 'application/pdf'));
    const sealedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: {
          storageKey: sealedKey,
          sha256: hashAfter,
          sizeBytes: sealed.length,
          // Only the LAST signature finishes the document. Marking it SIGNED at
          // step one would take it off everybody's list while two people still
          // had to sign it.
          ...(params.isLastStep ? { status: 'SIGNED' as const } : {}),
        },
      });

      if (params.signerRowId) {
        /*
          A step can be signed twice, and the schema only allows one.

          `DocumentSignature.signerId` is unique, so re-signing a step that was
          returned by a send-back would violate it and throw — send-back
          deliberately leaves earlier signatures in place as history. Detaching
          the superseded row keeps that history and frees the slot; deleting it
          would destroy evidence to satisfy a constraint.
        */
        await tx.documentSignature.updateMany({
          where: { signerId: params.signerRowId },
          data: { signerId: null },
        });
        await tx.documentSigner.update({
          where: { id: params.signerRowId },
          data: {
            status: 'SIGNED',
            signedAt,
            // Who actually signed, out of everyone who could have. Until this
            // moment the step had no answer to that, and recording it is what
            // takes the document off the others' lists.
            ...(signer.kind === 'user' ? { userId: signer.userId } : {}),
          },
        });
      }

      await tx.documentSignature.create({
        data: {
          documentId: document.id,
          signerId: params.signerRowId,
          userId: signer.kind === 'user' ? signer.userId : null,
          customerId: signer.kind === 'customer' ? signer.customerId ?? null : null,
          signerName: signer.name,
          signerRole: signer.kind === 'customer' ? signer.typedRole ?? null : null,
          batchId: params.batchId ?? null,
          signatureKey: params.sigKey,
          signatureSha256: params.signatureHash,
          consentText: CONSENT_TEXT,
          consentAt,
          signedAt,
          hashBefore,
          hashAfter,
          sealedAt,
          idempotencyKey: params.idempotencyKey,
        },
      });

      /*
        CONSENTED is written here too, if it is not already on the trail.

        `recordConsent` writes it when the client walks the flow properly, and
        both clients do. But a complete legal record must not depend on a client
        having made an extra call: the consent text and time are stored on the
        signature either way, so a trail missing the entry would contradict the
        certificate page printed from the same row.
      */
      const alreadyConsented = await tx.documentEvent.count({
        where: { documentId: document.id, type: 'CONSENTED' },
      });
      const types = alreadyConsented > 0
        ? (['SIGNED', 'SEALED'] as const)
        : (['CONSENTED', 'SIGNED', 'SEALED'] as const);

      for (const type of types) {
        await tx.documentEvent.create({
          data: {
            documentId: document.id,
            type,
            // A client has no user row, so the actor is null and the trail
            // carries the name they gave instead. Pretending a customer is a
            // member here would put a fake id into the evidence.
            actorId: signer.kind === 'user' ? signer.userId : null,
            meta: {
              ...(type === 'CONSENTED' ? { text: CONSENT_TEXT } : {}),
              ...(signer.kind === 'customer'
                ? { signedByLink: true, signerName: signer.name, batchId: params.batchId ?? null }
                : {}),
            },
            ...eventContext(params.ctx),
          },
        });
      }
    });

    // The original object is deliberately left in place. It is what the signer
    // read, it is content-addressed so nothing else can claim its key, and the
    // certificate page cites its hash — deleting it would remove the only copy
    // the before-hash describes.

    return { hashBefore, hashAfter, sealedAt };
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

  /**
   * Where an earlier signature was made from.
   *
   * Re-rendering the certificate must reprint what was recorded THEN, not the
   * provenance of whoever is signing now — otherwise a manager's device would
   * appear beside the worker's signature. The evidence trail already holds it:
   * the SIGNED event carries ip, device, app version and location, written at
   * the moment that signature was made.
   */
  private async signatureContext(signerUserId: string, documentId: string) {
    const event = await this.prisma.documentEvent.findFirst({
      where: { documentId, type: 'SIGNED', actorId: signerUserId },
      orderBy: { at: 'desc' },
      select: { ip: true, userAgent: true, appVersion: true, lat: true, lng: true },
    });
    return {
      sessionAuthenticatedAt: null as Date | null,
      ip: event?.ip ?? null,
      userAgent: event?.userAgent ?? null,
      appVersion: event?.appVersion ?? null,
      lat: event?.lat ?? null,
      lng: event?.lng ?? null,
    };
  }

  /**
   * Send a document back to an earlier signer, with a reason.
   *
   * The alternative — revoke and re-issue — throws away the chain, so the
   * worker signs a NEW document and the record of the first attempt disappears.
   * Sending back keeps one document and one history: the earlier step goes
   * pending again, everything after it goes pending again, and the trail says
   * why.
   *
   * Only the person currently being waited on may do it. Anybody else "sending
   * back" would be reaching into a document that is not in their hands.
   *
   * The signatures already collected are NOT deleted. They are what happened;
   * the seals that carry them remain valid for the versions they described, and
   * re-signing adds to the chain rather than rewriting it.
   */
  async sendBack(data: {
    actor: DocumentActor;
    documentId: string;
    reason: string;
    ctx?: RequestContext;
  }) {
    const reason = (data.reason ?? '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Say why you are sending it back');
    }

    /*
      Same door as sign / consent / acknowledge.

      This read was scoped by `typeScope`, which has no routed-signer
      exemption — so a shift leader on the step of a restricted type could sign
      it and not send it back. And it compared `current.userId`, which is null
      on a POOL step ("whoever is free signs") until somebody signs, so nobody
      in a pool could ever send back. Turn first (`maySignStep`, the rule the
      signing path reads), then the type with the routed-signer exemption.
    */
    const document = await this.prisma.document.findFirst({
      where: {
        id: data.documentId,
        organizationId: data.actor.organizationId,
        // Hidden from its member means not theirs to act on, whatever the route.
        NOT: { userId: data.actor.userId, hiddenFromMember: true },
      },
      select: {
        id: true, title: true, userId: true, status: true, hiddenFromMember: true,
        rolesOverridden: true, visibleToRoleIds: true, type: { select: { visibleToRoleIds: true } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    assertNotHiddenDraft(data.actor, document);

    const steps = await this.lookup.signerSteps(document.id);
    const current = nextPendingStep(steps);
    if (!current) throw new BadRequestException('This document is not waiting for a signature.');
    if (!maySignStep(current, data.actor.userId)) {
      throw new ForbiddenException('This document is waiting for somebody else.');
    }
    // On the current step = routed onto it: that is the authorisation to read it.
    assertTypeVisible(data.actor, document, true);

    // The nearest earlier step that actually signed. A skipped one cannot be
    // sent back to — nobody was ever asked.
    const target = [...steps]
      .filter((s) => s.order < current.order && s.status === 'SIGNED')
      .sort((a, b) => b.order - a.order)[0];
    if (!target) {
      throw new BadRequestException('There is no earlier signer to send this back to.');
    }

    await this.prisma.$transaction(async (tx) => {
      // That step and everything after it are pending again. Leaving the
      // in-between steps signed would let the chain skip them on the way back
      // up, and the order is the point.
      await tx.documentSigner.updateMany({
        where: { documentId: document.id, order: { gte: target.order }, status: 'SIGNED' },
        data: { status: 'PENDING', signedAt: null },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'SENT_BACK',
          actorId: data.actor.userId,
          meta: { reason, toStep: target.order },
          ...eventContext(data.ctx),
        },
      });
    });

    await this.notifier.notifyNextSigner(document.id, document.title);
    return { documentId: document.id, backToStep: target.order };
  }

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
  private async findSignableOr404(actor: DocumentActor, documentId: string) {
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
