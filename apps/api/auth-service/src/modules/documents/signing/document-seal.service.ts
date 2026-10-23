import { BadRequestException, Injectable } from '@nestjs/common';
import { personName, signatureStrength, type SignerStep, PrismaService } from '@hbcfield/shared';
import { documentKey, sha256 } from '@hbcfield/shared/storage';
import { sealSignedPdf } from '../core/contract-pdf';
import { type RequestContext, type SealSigner, CONSENT_TEXT, roleLabel, eventContext } from '../core/document-common';
import { DocumentStorageService } from '../core/document-storage.service';

/** Sealing a signature: the evidence (who, when, where from), the stamped file, the chain moved on. */
@Injectable()
export class DocumentSealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

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
      ? await this.storage.withStorage('reading the original document', () => store.get(document.originalKey as string))
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
        signerName: s.signerName ?? (s.user ? personName(s.user) : (s.customer?.name ?? '')),
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
          sessionAuthenticatedAt: signer.kind === 'user' ? (signer.sessionAuthenticatedAt ?? null) : null,
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
          customerId: signer.kind === 'customer' ? (signer.customerId ?? null) : null,
          signerName: signer.name,
          signerRole: signer.kind === 'customer' ? (signer.typedRole ?? null) : null,
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
      const types =
        alreadyConsented > 0 ? (['SIGNED', 'SEALED'] as const) : (['CONSENTED', 'SIGNED', 'SEALED'] as const);

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
}
