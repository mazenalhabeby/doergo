import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  nextPendingStep,
  acceptedForSigning,
  MAX_BATCH_SIGN,
  type SignableDocument,
  chainProgress,
  type SignerStep,
} from '@hbcfield/shared';
import { signatureKey, sha256 } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type RequestContext,
  CUSTOMER_LINK_STATUSES,
  type SealSigner,
  decodeSignaturePng,
  canRenderInline,
  roleLabel,
  downloadName,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentSigningService } from './document-signing.service';

/**
 * A client signing through an emailed link: their list, one document, and the batch.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentCustomerSigningService {
  private readonly logger = new Logger(DocumentCustomerSigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
    private readonly notifier: DocumentNotifierService,
    private readonly signing: DocumentSigningService,
  ) {}

  /**
   * Everything this client is waiting on, and everything they have signed.
   *
   * Scoped entirely by the resolved link — no id is ever taken from the
   * request. A client's own signer rows are the whole authorization: being
   * named as the signer of a step is what entitles somebody to that document,
   * and to nothing else.
   *
   * Only steps whose TURN it is appear under "to sign". A document three
   * signatures away is not theirs yet, and listing it would invite a
   * countersignature on work their supplier has not finished approving.
   */
  async listForCustomer(data: { organizationId: string; email: string }) {
    const rows = await this.prisma.documentSigner.findMany({
      where: {
        // Addressed to THIS address — not to a client record. Two of the three
        // kinds of counterparty have no record to scope by, and the address is
        // frozen onto the row at issue so a client changing theirs tomorrow
        // cannot redirect a document already in flight.
        email: data.email,
        document: {
          organizationId: data.organizationId,
          status: { in: [...CUSTOMER_LINK_STATUSES] },
        },
      },
      select: {
        id: true,
        order: true,
        status: true,
        openedAt: true,
        document: {
          select: {
            id: true,
            title: true,
            periodYear: true,
            periodMonth: true,
            user: { select: { firstName: true, lastName: true } },
            // The whole chain, so "whose turn is it" is decided from data
            // already in hand rather than a second query per document.
            signers: {
              select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true, signedAt: true },
            },
            signatures: {
              orderBy: { signedAt: 'asc' },
              select: {
                signedAt: true,
                signerName: true,
                user: { select: { firstName: true, lastName: true } },
                signer: { select: { role: true } },
              },
            },
          },
        },
      },
      orderBy: { document: { issuedAt: 'asc' } },
      // A bound, not pagination. A client with more than this waiting has a
      // process problem a longer list would not solve.
      take: 200,
    });

    const shape = (r: (typeof rows)[number]): SignableDocument => ({
      documentId: r.document.id,
      signerId: r.id,
      title: r.document.title,
      forMember: r.document.user
        ? `${r.document.user.firstName} ${r.document.user.lastName}`.trim()
        : null,
      periodYear: r.document.periodYear,
      periodMonth: r.document.periodMonth,
      alreadySigned: r.document.signatures.map((s) => ({
        name: s.signerName ?? (s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : ''),
        role: roleLabel(s.signer?.role ?? null),
        signedAt: s.signedAt.toISOString(),
      })),
      openedAt: r.openedAt ? r.openedAt.toISOString() : null,
    });

    const toSign = rows
      .filter((r) => {
        if (r.status !== 'PENDING') return false;
        const next = nextPendingStep(r.document.signers as unknown as SignerStep[]);
        return next?.order === r.order;
      })
      .map(shape);

    const signed = rows.filter((r) => r.status === 'SIGNED').map(shape);
    return { toSign, signed };
  }

  /**
   * A URL for one document the client may see, and a record that they saw it.
   *
   * `openedAt` is evidence, not a gate. Requiring somebody to open ten
   * identical time sheets buys clicking-through, which is a worse signature
   * than the honest one — so this records the truth and the certificate reports
   * it, instead of enforcing a fiction.
   */
  async openForCustomer(data: { organizationId: string; email: string; signerId: string }) {
    const row = await this.prisma.documentSigner.findFirst({
      where: {
        id: data.signerId,
        email: data.email,
        /*
          ⚠️ The same statuses the link LISTS. This asked only the organization,
          so a document revoked (or superseded) after the email went out still
          minted a fresh download URL for anybody holding the live link and the
          signer id — the list hid it, the file route served it.
        */
        document: { organizationId: data.organizationId, status: { in: [...CUSTOMER_LINK_STATUSES] } },
      },
      select: {
        id: true,
        openedAt: true,
        document: { select: { id: true, storageKey: true, title: true, mimeType: true } },
      },
    });
    if (!row) throw new NotFoundException('Document not found');

    const store = this.storage.requireStore();
    const url = await this.storage.withStorage('opening the document', () =>
      store.presignDownload(
        row.document.storageKey,
        downloadName(row.document.title, row.document.mimeType),
        undefined,
        { inline: canRenderInline(row.document.mimeType), contentType: row.document.mimeType },
      ),
    );

    if (!row.openedAt) {
      await this.prisma.documentSigner.update({
        where: { id: row.id },
        data: { openedAt: new Date() },
      });
      // No actorId: a client has no user row, and putting a member's id here
      // would be a false entry on an append-only evidence trail.
      await this.prisma.documentEvent.create({
        data: { documentId: row.document.id, type: 'OPENED', meta: { byLink: true } },
      });
    }
    return { url };
  }

  /**
   * One ceremony, many documents.
   *
   * A client with eleven time sheets signs once. What is shared is the ACT —
   * the drawing, the consent, the sitting — and nothing else: each document
   * gets its own signature row, its own hash chain and its own certificate,
   * exactly as if it had been signed alone. Anything else would make one
   * document's evidence depend on which others it was batched with.
   *
   * Four things here are deliberate.
   *
   * The selection is intersected with what is pending RIGHT NOW, because the
   * page the client is looking at may be hours old and a document may have been
   * sent back or revoked since it was drawn.
   *
   * The signature image is stored ONCE — keys are content-addressed, so one
   * drawing across eleven documents is one object and eleven references.
   *
   * Each document gets its own idempotency key derived from the batch id. One
   * shared key would hand every document after the first the FIRST one's
   * result, which is exactly how a batch silently signs one document and
   * reports eleven.
   *
   * And a failure part-way does not throw. Each seal is its own transaction, so
   * ten successful signatures are ten real signatures whatever happens to the
   * eleventh; reporting total failure would tell the client none of it took
   * when most of it did.
   */
  async signBatchAsCustomer(data: {
    organizationId: string;
    email: string;
    signerIds: string[];
    signatureImage: string;
    typedName: string;
    typedRole?: string | null;
    idempotencyKey: string;
    ctx?: RequestContext;
  }) {
    const typedName = (data.typedName ?? '').trim();
    if (typedName.length < 2) throw new BadRequestException('Please enter your name.');
    if (!Array.isArray(data.signerIds) || data.signerIds.length === 0) {
      throw new BadRequestException('Choose at least one document to sign.');
    }
    if (data.signerIds.length > MAX_BATCH_SIGN) {
      throw new BadRequestException(`You can sign at most ${MAX_BATCH_SIGN} documents at once.`);
    }
    if ((data.idempotencyKey ?? '').length < 8) {
      throw new BadRequestException('idempotencyKey must be at least 8 characters');
    }

    const { toSign } = await this.listForCustomer(data);
    const accepted = acceptedForSigning(data.signerIds, toSign);
    if (accepted.length === 0) {
      throw new BadRequestException('Those documents are no longer waiting for your signature.');
    }

    const store = this.storage.requireStore();
    const png = decodeSignaturePng(data.signatureImage);
    const signatureHash = sha256(png);
    const sigKey = signatureKey(data.organizationId, signatureHash);
    await this.storage.withStorage('storing the signature', () => store.put(sigKey, png, 'image/png'));

    const batchId = data.idempotencyKey;
    const signer: SealSigner = {
      kind: 'customer',
      name: typedName,
      email: data.email,
      typedRole: data.typedRole?.trim() || null,
    };

    const signed: string[] = [];
    const failed: { documentId: string; reason: string }[] = [];

    for (const signerId of accepted) {
      const row = toSign.find((d) => d.signerId === signerId);
      if (!row) continue;
      try {
        const document = await this.prisma.document.findFirst({
          where: { id: row.documentId, organizationId: data.organizationId },
          select: {
            id: true,
            title: true,
            storageKey: true,
            sha256: true,
            originalKey: true,
            organization: { select: { name: true } },
          },
        });
        if (!document) continue;

        // Re-read the chain per document. The list said it was their turn; this
        // says so at the moment of signing, which is the one that counts.
        const steps = await this.lookup.signerSteps(document.id);
        const currentStep = nextPendingStep(steps);
        /*
          The row we are about to sign must STILL be the current step.

          The list said so when it was drawn; this says so at the moment of
          signing, which is the one that counts — a document could have been
          sent back in between, and signing a superseded step would attach a
          countersignature to a version its supplier has withdrawn.
        */
        const mine = await this.prisma.documentSigner.findFirst({
          where: { id: signerId, documentId: document.id, status: 'PENDING' },
          select: { order: true },
        });
        if (!currentStep || !mine || currentStep.order !== mine.order) continue;

        const isLastStep = chainProgress(
          steps.map((s) =>
            s.order === currentStep.order ? { ...s, status: 'SIGNED' as const } : s,
          ),
        ).complete;

        await this.signing.sealAndRecord({
          document,
          organizationId: data.organizationId,
          signer,
          png,
          signatureHash,
          sigKey,
          currentStep,
          signerRowId: signerId,
          isLastStep,
          idempotencyKey: `${batchId}:${document.id}`,
          ctx: data.ctx,
          batchId,
        });
        signed.push(document.id);

        if (!isLastStep) await this.notifier.notifyNextSigner(document.id, document.title);
      } catch (err) {
        failed.push({ documentId: row.documentId, reason: (err as Error).message });
        this.logger.warn(`Batch sign failed for ${row.documentId}: ${(err as Error).message}`);
      }
    }

    return { signed: signed.length, failed, batchId };
  }
}
