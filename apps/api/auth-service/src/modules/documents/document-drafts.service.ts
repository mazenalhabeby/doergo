import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { personName, isBlocking, parseRoute, runWithCronLock, PERSON_BRIEF_SELECT } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  type DocumentActor,
  typeScope,
  type RequestContext,
  ABANDONED_DRAFT_DAYS,
  type SignerCandidate,
  type RouteCandidateStep,
  assertCanIssue,
  eventContext,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentRoutingService } from './document-routing.service';

/**
 * A batch of issued pages before it goes out: the drafts, publishing them,
 * discarding one, and the nightly clean-up.
 */
@Injectable()
export class DocumentDraftsService {
  private readonly logger = new Logger(DocumentDraftsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly notifier: DocumentNotifierService,
    private readonly routing: DocumentRoutingService,
  ) {}


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
        user: { select: PERSON_BRIEF_SELECT },
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
                      name: personName(d.user),
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
        user: { select: PERSON_BRIEF_SELECT },
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
