import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import {
  type DocumentActor,
  assertTypeVisible,
  typeScope,
  assertNotHiddenDraft,
  type RequestContext,
  canRenderInline,
  downloadName,
  eventContext,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';

/**
 * Links to the bytes. Minting a link IS the "opened" event, which is why no list
 * returns a URL.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentDownloadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

  /**
   * Mint a download link — and record that it happened.
   *
   * The mint IS the OPENED event. That is why no list endpoint returns a URL:
   * if links were handed out in bulk, "opened" would record a page render
   * rather than a person reading their contract, and the delivery evidence
   * would be worthless.
   */
  async getDownloadUrl(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    // Authorization first, storage second. Reversed, a server with S3
    // misconfigured would answer "storage is not configured" to a caller who is
    // not entitled to the document — which tells them it exists.
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      include: { type: { select: { label: true, visibleToRoleIds: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');
    assertNotHiddenDraft(data.actor, document);

    const isSelf = document.userId === data.actor.userId;
    /*
      Being asked to sign it IS the authorisation to read it.

      A responsible countersigning a worker's time sheet is usually a shift
      leader, and shift leaders do not hold `canOpenMemberDocuments` — so
      without this they were sent a signature request for a document they were
      forbidden to open. Signing something you cannot read is the one outcome a
      signing feature must never produce.

      Scoped to this document by their own signer row, and it survives their
      signature on purpose: a person who signed something must always be able to
      retrieve what they signed.
    */
    /*
      Named on a step, OR among the people it is open to.

      `userId` is null until somebody signs, so matching it alone would refuse
      the document to exactly the people being asked to sign it — signing
      something you cannot read is the one outcome a signing feature must never
      produce.
    */
    const isSigner =
      isSelf ||
      (await this.prisma.documentSigner.count({
        where: { documentId: document.id, eligibleUserIds: { has: data.actor.userId } },
      })) > 0;

    if (!isSigner && !data.actor.canOpenMemberDocuments) {
      // Distinct from the list permission on purpose: a dispatcher may need to
      // know a certificate exists and expires on Friday without being able to
      // open a colleague's payslip. 404, not 403: a refusal confirms it exists.
      throw new NotFoundException('Document not found');
    }

    /*
      The last door, and the one that matters most.

      A link is minted here. A restricted document must not be openable through a
      URL that leaked from a screen somebody could once see, or from a role that
      has since been narrowed — so the type is checked at the mint, not only on
      the lists that led here.

      `isSigner` passes through: it already covers the subject and everyone
      routed onto the document, and both read it through their own relationship
      to it rather than through the type.
    */
    assertTypeVisible(data.actor, document, isSigner);

    const store = this.storage.requireStore();
    /*
      Rendered in the browser, not saved to disk.

      Someone checking whether a payslip is right wants to LOOK at it. Forcing a
      download made that a three-step errand — save, open, delete — and left a
      copy of a confidential document in everybody's Downloads folder, which is
      the last place it should accumulate.

      Inline is safe only because of what this product accepts: PDF, PNG and
      JPEG are inert. HTML and SVG can execute, and neither is in ALLOWED_MIME —
      so the guard is that list, and this must be revisited if anything is ever
      added to it. `canRenderInline` reads the same list rather than repeating
      it, so the two cannot drift apart.

      The content type is sent too: object storage will serve a PDF as
      application/octet-stream given the chance, and a browser handed that saves
      the file no matter what the disposition asked for.
    */
    const url = await this.storage.withStorage('preparing a download', () =>
      store.presignDownload(
        document.storageKey,
        downloadName(document.title, document.mimeType),
        undefined,
        { inline: canRenderInline(document.mimeType), contentType: document.mimeType },
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      // First open only. Overwriting it on every read would lose the one fact
      // that matters for delivery evidence: when they first saw it.
      if (isSelf && document.firstOpenedAt === null) {
        await tx.document.update({
          where: { id: document.id },
          data: { firstOpenedAt: new Date() },
        });
      }
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'OPENED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
    });

    return { url, fileName: downloadName(document.title, document.mimeType) };
  }

  /**
   * Everything in a member's file, for them to take away.
   *
   * GDPR portability, and cheap to build now because the alternative is
   * assembling it by hand under a thirty-day deadline. Returns a manifest plus
   * one short-lived link per document — not the bytes, because a fifty-document
   * archive assembled in a Node process is exactly the thing the rest of this
   * feature refuses to do.
   *
   * SELF ONLY unless the caller may open other members' documents. A subject
   * access request is about YOUR data; someone else's export is their file.
   */
  async exportForMember(data: {
    actor: DocumentActor;
    targetUserId?: string;
    ctx?: RequestContext;
  }) {
    const targetUserId = data.targetUserId ?? data.actor.userId;
    const isSelf = targetUserId === data.actor.userId;
    // 404, not 403: a refusal would confirm the person has a file here.
    if (!isSelf && !data.actor.canOpenMemberDocuments) {
      throw new NotFoundException('Member not found');
    }
    const store = this.storage.requireStore();

    const documents = await this.prisma.document.findMany({
      where: {
        // A manager exporting somebody else's file takes away only what they may
        // read; on a self-export every row is the caller's own and this admits
        // all of them.
        ...typeScope(data.actor),
        organizationId: data.actor.organizationId,
        userId: targetUserId,
        status: { not: 'DRAFT' },
      },
      include: {
        type: { select: { key: true, label: true, direction: true } },
        // The whole chain, oldest first: an export of somebody's file should
        // carry every signature the document collected, not just the last.
        signatures: {
          select: { signedAt: true, hashAfter: true },
          orderBy: { signedAt: 'asc' },
        },
      },
      orderBy: [{ issuedAt: 'asc' }],
    });

    const files = [];
    for (const d of documents) {
      files.push({
        title: d.title,
        type: d.type.label,
        issuedAt: d.issuedAt,
        periodYear: d.periodYear,
        periodMonth: d.periodMonth,
        status: d.status,
        sizeBytes: d.sizeBytes,
        // The hash is included so the recipient can verify later that what they
        // downloaded is what the record says it was.
        sha256: d.sha256,
        signedAt: d.signatures[0]?.signedAt ?? null,
        url: await this.storage.withStorage('preparing an export', () =>
          store.presignDownload(
            d.storageKey,
            downloadName(d.title, d.mimeType),
            // Longer than a single open: a person downloading fifty files needs
            // more than a minute, and this link was minted for them by name.
            15 * 60,
          ),
        ),
      });
    }

    // Recorded like any other read, against every document in the export.
    if (files.length > 0) {
      await this.prisma.documentEvent.createMany({
        data: documents.map((d) => ({
          documentId: d.id,
          type: 'DOWNLOADED' as const,
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        })),
      });
    }

    return { exportedAt: new Date(), count: files.length, files };
  }
}
