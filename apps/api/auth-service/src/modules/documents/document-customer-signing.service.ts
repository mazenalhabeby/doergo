import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { personName, nextPendingStep, type SignableDocument, type SignerStep } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CUSTOMER_LINK_STATUSES, canRenderInline, roleLabel, downloadName } from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentSealService } from './document-seal.service';

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
    private readonly seal: DocumentSealService,
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
      forMember: r.document.user ? personName(r.document.user) : null,
      periodYear: r.document.periodYear,
      periodMonth: r.document.periodMonth,
      alreadySigned: r.document.signatures.map((s) => ({
        name: s.signerName ?? (s.user ? personName(s.user) : ''),
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
}
