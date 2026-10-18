import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { personName, periodIsValid, retentionUntil, isBlocking, Role } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  typeScope,
  type RequestContext,
  assertUploadable,
  sharedStagingPrefix,
  assertStagingKey,
  assertNotOwnReview,
  assertCanIssue,
  cuidish,
  eventContext,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentRoutingService } from './document-routing.service';

/**
 * Issuing: the office files a document to a member, one at a time or as a
 * staged batch released together.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentIssuingService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
    private readonly notifier: DocumentNotifierService,
    private readonly routing: DocumentRoutingService,
  ) {}

  /**
   * Step one of two: a link the admin's browser can PUT the file to.
   *
   * Nothing is written to the database here. An abandoned upload leaves an
   * orphaned object and no row, which is the right way round — a row pointing
   * at bytes that never arrived would show the member a document that cannot
   * be opened.
   */
  async presignUpload(data: {
    actor: DocumentActor;
    userId: string;
    typeId: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    assertCanIssue(data.actor);
    const store = this.storage.requireStore();

    const extension = assertUploadable(data.mimeType, data.sizeBytes);

    await this.lookup.assertMemberOfOrg(data.userId, data.actor.organizationId);
    await this.lookup.findTypeOr404(data.typeId, data.actor.organizationId);

    // A staging key, because the content hash is not known until the bytes
    // exist. `confirmUpload` reads them back, hashes, and moves the object to
    // its content-addressed home.
    const staging = `${data.actor.organizationId}/documents/_staging/${cuidish()}.${extension}`;
    return this.storage.withStorage('preparing an upload', () =>
      store.presignUpload(staging, data.mimeType, data.sizeBytes),
    );
  }

  /**
   * Step two: the bytes are up, so verify and file them.
   *
   * The client says it uploaded; this checks rather than believes it. The
   * object is fetched, hashed, and re-stored under its content address, so the
   * `sha256` on the row is something this service computed — never something a
   * client asserted.
   */
  async confirmUpload(data: {
    /** Chosen signer per route step, where the step had more than one candidate. */
    signerChoices?: Array<{ order: number; userId?: string | null; customerId?: string | null }>;
    actor: DocumentActor;
    stagingKey: string;
    userId: string;
    typeId: string;
    title: string;
    periodYear?: number | null;
    periodMonth?: number | null;
    expiresOn?: string | null;
    /*
      Stage instead of publish.

      A payroll batch confirms thirty files one at a time — the browser drives
      it, so each upload/hash/store round trip is its own small request and a
      failure is isolated to one row. They land as DRAFT: invisible to the
      member, and no notification is sent. `publishBatch` releases them all at
      once, which is the only moment anything becomes visible.

      This is why there is no job queue here. The expensive work is already
      spread across many requests; a queue would only move the same work
      somewhere it is harder to watch.
    */
    asDraft?: boolean;
    /**
     * Replace this document with the new one: the old one is SUPERSEDED and
     * hidden from its member, so they see only the version they are now asked
     * to sign. Its record, signatures included, stays with the organization.
     */
    replacesId?: string | null;
    ctx?: RequestContext;
  }) {
    assertCanIssue(data.actor);
    assertStagingKey(data.stagingKey, sharedStagingPrefix(data.actor.organizationId));

    const member = await this.lookup.assertMemberOfOrg(data.userId, data.actor.organizationId);
    const type = await this.lookup.findTypeOr404(data.typeId, data.actor.organizationId);
    // A credential filed about yourself would skip verification entirely; your
    // own goes through `/documents/mine` and waits for somebody else.
    if (type.isCredential) assertNotOwnReview(data.actor, data.userId);

    let replaced: { id: string; title: string; userId: string } | null = null;
    if (data.replacesId) {
      if (!data.actor.canReplaceDocuments || data.actor.isExternal) {
        throw new ForbiddenException('You cannot replace documents');
      }
      if (data.asDraft) throw new BadRequestException('A replacement is issued, not staged');
      replaced = await this.prisma.document.findFirst({
        where: {
          ...typeScope(data.actor),
          id: data.replacesId,
          organizationId: data.actor.organizationId,
          status: { notIn: ['DRAFT', 'SUPERSEDED'] },
          supersededBy: { is: null },
        },
        select: { id: true, title: true, userId: true },
      });
      if (!replaced) throw new NotFoundException('Document not found');
      // Same person, always: a "replacement" filed to somebody else would be a
      // second document wearing the first one's history.
      if (replaced.userId !== data.userId) {
        throw new BadRequestException('A replacement goes to the same member');
      }
    }

    if (!periodIsValid(type.cadence, data.periodYear, data.periodMonth)) {
      throw new BadRequestException(
        `A ${type.cadence.toLowerCase().replace('_', '-')} document does not take that period`,
      );
    }
    if (type.hasExpiry && !data.expiresOn) {
      throw new BadRequestException(`${type.label} needs an expiry date`);
    }

    const filed = await this.storage.takeStagedObject(data.actor.organizationId, data.stagingKey);

    const issuedAt = new Date();
    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          organizationId: data.actor.organizationId,
          userId: data.userId,
          typeId: type.id,
          title: data.title.trim() || type.label,
          periodYear: data.periodYear ?? null,
          periodMonth: data.periodMonth ?? null,
          storageKey: filed.key,
          sha256: filed.hash,
          /*
            The same object, recorded twice on purpose.

            storageKey moves to the sealed copy each time somebody signs;
            originalKey never moves. Re-rendering from the original is what
            keeps a three-party document at one signature block and one
            certificate instead of six appended pages.
          */
          originalKey: filed.key,
          originalSha256: filed.hash,
          sizeBytes: filed.sizeBytes,
          mimeType: filed.mimeType,
          status: data.asDraft
            ? 'DRAFT'
            : isBlocking(type.signatureMode)
              ? 'AWAITING_SIGNATURE'
              : 'ISSUED',
          issuedById: data.actor.userId,
          issuedAt,
          expiresOn: data.expiresOn ? new Date(data.expiresOn) : null,
          retentionUntil: retentionUntil(issuedAt, type.retentionMonths),
          ...(replaced ? { supersedesId: replaced.id } : {}),
        },
      });
      if (replaced) {
        await tx.document.update({
          where: { id: replaced.id },
          data: { status: 'SUPERSEDED', hiddenFromMember: true },
        });
        // Nobody is still waiting to sign the version that was replaced.
        await tx.documentSigner.updateMany({
          where: { documentId: replaced.id, status: 'PENDING' },
          data: { status: 'SKIPPED' },
        });
        await tx.documentEvent.create({
          data: {
            documentId: replaced.id,
            type: 'SUPERSEDED',
            actorId: data.actor.userId,
            meta: { replacedBy: created.id },
            ...eventContext(data.ctx),
          },
        });
        await tx.activityLog.create({
          data: {
            eventType: 'DOCUMENT_REPLACED',
            userId: data.actor.userId,
            targetUserId: data.userId,
            organizationId: data.actor.organizationId,
            resourceType: 'documents',
            resourceId: replaced.id,
            ipAddress: data.ctx?.ip ?? null,
            userAgent: data.ctx?.userAgent ?? null,
            metadata: {
              title: replaced.title,
              newTitle: created.title,
              newDocumentId: created.id,
              member: personName(member),
            },
          },
        });
      }
      /*
        No event for a staged row.

        The trail begins at ISSUED, written by `publishBatch`, because that is
        the moment the document exists for the member. Recording something at
        upload time would either be a lie (ISSUED, when nobody has it) or a
        state with no meaning outside this screen — and an evidence trail whose
        first line is neither of those is not evidence.
      */
      if (!data.asDraft) {
        await tx.documentEvent.create({
          data: {
            documentId: created.id,
            type: 'ISSUED',
            actorId: data.actor.userId,
            ...eventContext(data.ctx),
          },
        });
        // The chain, resolved and frozen in the same transaction as the
        // document. A document that existed without its route would have no way
        // to say whose turn it was.
        await this.routing.createSignerRows(tx, created, type.signerRoute, data.signerChoices);
      }
      return created;
    });

    // Staged documents notify on publish, not on upload.
    if (!data.asDraft) {
      this.notifier.notifyIssued(document.id, member, type.label, document.title, isBlocking(type.signatureMode));
    }
    return document;
  }

  /**
   * The people a batch can be matched against.
   *
   * Returned so the browser can run the matcher itself: thirty filenames
   * resolved locally is instant and lets the admin correct a row without a
   * round trip per keystroke. The matching is only a SUGGESTION — every
   * document is still filed by an explicit userId that the server re-checks
   * belongs to this organization.
   */
  async listMatchCandidates(data: { actor: DocumentActor }) {
    assertCanIssue(data.actor);
    return this.prisma.user.findMany({
      /*
        Staff only. Portal customers carry a customerId and belong to Clients
        Portals, not to a payroll run — they appeared in this picker beside real
        members, which invites issuing somebody's payslip to a customer of the
        business. `listOrgMembers` has carried this filter all along; this query
        was written without it.
      */
      where: {
        organizationId: data.actor.organizationId,
        isActive: true,
        customerId: null,
        role: { not: Role.CUSTOMER },
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        // Role and job title, so the template editor can answer "who would
        // actually receive this?" while the bindings are being chosen rather
        // than after a save. Same two fields the server resolves a template by.
        memberRoleId: true, position: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }
}
