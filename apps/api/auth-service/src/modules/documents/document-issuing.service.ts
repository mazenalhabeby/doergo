import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  periodIsValid,
  retentionUntil,
  isBlocking,
  Role,
  parseRoute,
  runWithCronLock,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  type DocumentActor,
  typeScope,
  type RequestContext,
  ABANDONED_DRAFT_DAYS,
  type SignerCandidate,
  type RouteCandidateStep,
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
  private readonly logger = new Logger(DocumentIssuingService.name);

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
              member: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim(),
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

  /**
   * Everything staged and not yet released, with who it is for — and, where the
   * type has a route, who could sign each step.
   *
   * The candidates are resolved HERE rather than by a second call per draft.
   * A batch of thirty time sheets would otherwise be thirty round trips to
   * discover that twenty-nine of them had nothing to ask.
   */
  async listDrafts(data: { actor: DocumentActor }) {
    assertCanIssue(data.actor);
    const drafts = await this.prisma.document.findMany({
      // Drafts are documents about to be issued TO somebody else.
      where: { organizationId: data.actor.organizationId, status: 'DRAFT', ...typeScope(data.actor) },
      select: {
        id: true,
        title: true,
        periodYear: true,
        periodMonth: true,
        sizeBytes: true,
        mimeType: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        type: { select: { id: true, label: true, signatureMode: true, signerRoute: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    /*
      One resolution per distinct question, not per draft.

      Thirty time sheets against one type ask the same ORG_REPRESENTATIVE
      question thirty times, and members repeat across a batch too. The cache
      holds the PROMISE rather than the result, so concurrent drafts asking the
      same question share one query instead of both missing and both issuing it.
    */
    const cache = new Map<string, Promise<SignerCandidate[]>>();

    return Promise.all(
      drafts.map(async (d) => {
        const route = parseRoute(d.type.signerRoute);
        if (!route) return { ...d, routeSteps: null };

        const steps = await Promise.all(
          route.map(async (s, i): Promise<RouteCandidateStep> => ({
            order: i + 1,
            role: s.role,
            // The member is already selected above; asking the database who
            // they are would be a query to learn something in hand.
            candidates:
              s.role === 'MEMBER'
                ? [
                    {
                      kind: 'USER',
                      id: d.user.id,
                      name: `${d.user.firstName} ${d.user.lastName}`.trim(),
                      email: d.user.email,
                    },
                  ]
                : await this.routing.cachedCandidatesForRole(
                    cache,
                    data.actor.organizationId,
                    d.user.id,
                    s.role,
                  ),
          })),
        );

        return { ...d, routeSteps: steps };
      }),
    );
  }

  /**
   * Release a staged batch.
   *
   * ALL OR NOTHING, in one transaction. Publishing the rows that resolved and
   * leaving the rest would put some payslips out and hide the problem behind a
   * half-finished screen — and one payslip in the wrong hands is not something
   * that can be taken back. Everything here is cheap: the uploading, hashing
   * and storing already happened, one request per file, so this is a status
   * flip and a set of event rows.
   */
  async publishBatch(data: {
    actor: DocumentActor;
    documentIds: string[];
    /*
      Chosen signers, per document, for steps whose route left a choice.

      Carried at publish rather than at upload because the chain is built at
      publish — and because a draft may sit for days between the two, during
      which the answer could change.
    */
    signerChoices?: Array<{
      documentId: string;
      choices: Array<{ order: number; userId?: string | null; customerId?: string | null }>;
    }>;
    ctx?: RequestContext;
  }) {
    assertCanIssue(data.actor);

    const ids = [...new Set(data.documentIds.filter(Boolean))];
    if (ids.length === 0) throw new BadRequestException('Nothing to publish');

    // Scoped by organization AND status: an id from another tenant, or one that
    // was already published, simply is not found — and the count check below
    // then refuses the whole batch rather than publishing the rest.
    const drafts = await this.prisma.document.findMany({
      // …and by type: a restricted draft is not in the list this caller staged
      // from, so an id reaching here is one they were never shown.
      where: {
        ...typeScope(data.actor),
        id: { in: ids },
        organizationId: data.actor.organizationId,
        status: 'DRAFT',
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        type: { select: { label: true, signatureMode: true, signerRoute: true } },
      },
    });

    if (drafts.length !== ids.length) {
      throw new BadRequestException(
        'Some of these documents are no longer staged. Reload the batch and try again.',
      );
    }

    const published = await this.prisma.$transaction(async (tx) => {
      const out: typeof drafts = [];
      for (const draft of drafts) {
        const updated = await tx.document.update({
          where: { id: draft.id },
          data: {
            status: isBlocking(draft.type.signatureMode) ? 'AWAITING_SIGNATURE' : 'ISSUED',
            issuedAt: new Date(),
          },
        });
        /*
          The chain is built HERE, not at upload.

          Documents are staged as drafts and published in a batch, so upload is
          not the moment they become real — publishing is. Building the route at
          upload would resolve signers for documents that might be discarded,
          and leave a published one with no chain at all.
        */
        await this.routing.createSignerRows(
          tx,
          updated,
          draft.type.signerRoute,
          data.signerChoices?.find((c) => c.documentId === draft.id)?.choices,
        );

        await tx.documentEvent.create({
          data: {
            documentId: draft.id,
            type: 'ISSUED',
            actorId: data.actor.userId,
            ...eventContext(data.ctx),
          },
        });
        out.push({ ...draft, ...updated } as (typeof drafts)[number]);
      }
      return out;
    });

    // Notifications AFTER the transaction commits. Emitting inside it would
    // tell thirty people about documents that a rollback then un-published.
    for (const doc of published) {
      this.notifier.notifyIssued(
        doc.id,
        doc.user,
        doc.type.label,
        doc.title,
        isBlocking(doc.type.signatureMode),
      );
    }

    return { published: published.length };
  }

  /**
   * Throw a staged row away before anyone has seen it.
   *
   * A hard delete, unlike `revoke`: nothing was ever issued, so there is no
   * record to preserve. The object is left alone because it is
   * content-addressed and another member's identical file may point at it.
   */
  async discardDraft(data: { actor: DocumentActor; documentId: string }) {
    assertCanIssue(data.actor);
    const draft = await this.prisma.document.findFirst({
      where: {
        ...typeScope(data.actor),
        id: data.documentId,
        organizationId: data.actor.organizationId,
        status: 'DRAFT',
      },
    });
    if (!draft) throw new NotFoundException('Staged document not found');
    await this.prisma.document.delete({ where: { id: draft.id } });
    await this.storage.freeStorageIfUnreferenced(draft.storageKey);
    return { success: true };
  }

  /**
   * Staged batches nobody ever released.
   *
   * A batch is uploaded first and published second, so thirty payslips become
   * visible in one moment rather than trickling out. The cost of that design is
   * this: close the tab in between and the drafts sit in the database and in
   * storage, invisible to the member, for ever. They were not reachable from any
   * screen either, so nothing ever cleaned them up.
   *
   * Left alone for a week, because an admin returning on Monday to a batch they
   * staged on Friday should find it waiting. After that it is abandoned, and
   * abandoned staged work is litter that costs storage and confuses whoever
   * eventually looks.
   *
   * Cheap by construction: one indexed read a day against a partial index that
   * only covers DRAFT rows, so it stays small no matter how large the documents
   * table grows. The lease is not optional — NestJS starts this schedule in
   * EVERY replica.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeAbandonedDrafts(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'documents:draftPurge', ttlSeconds: 900, logger: this.logger },
      async () => {
        const cutoff = new Date(Date.now() - ABANDONED_DRAFT_DAYS * 24 * 60 * 60 * 1000);
        const stale = await this.prisma.document.findMany({
          where: { status: 'DRAFT', createdAt: { lt: cutoff } },
          select: { id: true, storageKey: true },
          // Bounded: a runaway batch should cost one night's sweep, not a
          // transaction that holds the table while it deletes a million rows.
          take: 500,
        });
        if (stale.length === 0) return;

        await this.prisma.document.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
        // After the rows, so the reference check sees the world as it now is.
        for (const key of new Set(stale.map((d) => d.storageKey))) {
          await this.storage.freeStorageIfUnreferenced(key);
        }
        this.logger.log(`Purged ${stale.length} abandoned staged draft(s)`);
      },
    );
  }
}
