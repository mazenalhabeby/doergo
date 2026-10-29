import { Inject, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { nextPendingStep, acceptedForSigning, MAX_BATCH_SIGN, chainProgress } from '@hbcfield/shared';
import { signatureKey, sha256 } from '@hbcfield/shared/storage';
import { PrismaService } from '@hbcfield/shared';
import { type RequestContext, type SealSigner, decodeSignaturePng, CLIENT_STEP_WHERE } from '../core/document-common';
import { DocumentStorageService } from '../core/document-storage.service';
import { DocumentLookupService } from '../core/document-lookup.service';
import { DocumentNotifierService } from '../core/document-notifier.service';
import { DocumentSealService } from './document-seal.service';
import { DocumentCustomerSigningService } from './document-customer-signing.service';

/** A client signing several documents at once from the sign link: each one checked, signed and sealed. */
@Injectable()
export class CustomerSignBatchService {

  @Inject(DocumentCustomerSigningService) private readonly customerSigning!: DocumentCustomerSigningService;

  private readonly logger = new Logger(CustomerSignBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
    private readonly notifier: DocumentNotifierService,
    private readonly seal: DocumentSealService,
  ) {}


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

    const { toSign } = await this.customerSigning.listForCustomer(data);
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
          where: { id: signerId, documentId: document.id, status: 'PENDING', ...CLIENT_STEP_WHERE },
          select: { order: true },
        });
        if (!currentStep || !mine || currentStep.order !== mine.order) continue;

        const isLastStep = chainProgress(
          steps.map((s) =>
            s.order === currentStep.order ? { ...s, status: 'SIGNED' as const } : s,
          ),
        ).complete;

        await this.seal.sealAndRecord({
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
