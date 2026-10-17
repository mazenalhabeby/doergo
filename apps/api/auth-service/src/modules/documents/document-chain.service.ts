import { Injectable, NotFoundException } from '@nestjs/common';
import { personName, isCurrentSigner, chainProgress, type SignerStep } from '@hbcfield/shared';
import { type DocumentActor, assertTypeVisible, assertNotHiddenDraft } from './document-common';
import { DocumentRoutingBase } from './document-routing.base';

/** Reading a signing chain: who has signed one document, and what waits on me. */
@Injectable()
export class DocumentChainService extends DocumentRoutingBase {
  /**
   * The chain on one document, for somebody about to sign it.
   *
   * A signer needs to see what is above their name — a manager countersigning a
   * time sheet is agreeing with the worker's signature, and being asked to do
   * that blind is being asked to rubber-stamp.
   *
   * Readable by anyone IN the chain, or by anyone allowed to see member
   * documents. Deliberately not gated on `canOpenMemberDocuments`: who signed
   * and when is metadata, and needing the right to read a payslip in order to
   * see whether it was signed would make the whole register unusable.
   */
  async documentChain(data: { actor: DocumentActor; documentId: string }) {
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      select: {
        id: true,
        title: true,
        userId: true,
        status: true,
        hiddenFromMember: true,
        rolesOverridden: true,
        visibleToRoleIds: true,
        type: { select: { visibleToRoleIds: true } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    assertNotHiddenDraft(data.actor, document);

    const rows = await this.prisma.documentSigner.findMany({
      where: { documentId: document.id },
      orderBy: { order: 'asc' },
      select: {
        order: true,
        role: true,
        status: true,
        userId: true,
        eligibleUserIds: true,
        customerId: true,
        signedAt: true,
        user: { select: { firstName: true, lastName: true } },
        customer: { select: { name: true } },
      },
    });

    // Same reasoning as opening it: somebody asked to sign must be able to see
    // what has been signed above them, and until they sign there is no userId
    // on their step to match.
    const inChain = rows.some(
      (r) => r.userId === data.actor.userId || (r.eligibleUserIds ?? []).includes(data.actor.userId),
    );
    const isSubject = document.userId === data.actor.userId;
    // 404, not 403 — the same answer as a document that does not exist.
    if (!inChain && !isSubject && !data.actor.canViewMemberDocuments) {
      throw new NotFoundException('Document not found');
    }
    // Read AFTER the chain is known: a signer routed onto this document reads it
    // through their step, not through the type.
    assertTypeVisible(data.actor, document, inChain);

    const steps = rows.map((r) => ({
      order: r.order,
      role: r.role,
      status: r.status,
      name: r.user ? personName(r.user) : (r.customer?.name ?? null),
      signedAt: r.signedAt,
      isYou: r.userId === data.actor.userId,
    }));

    const progress = chainProgress(rows as unknown as SignerStep[]);
    return {
      documentId: document.id,
      title: document.title,
      steps,
      total: progress.total,
      signed: progress.signed,
      complete: progress.complete,
      currentOrder: progress.current?.order ?? null,
    };
  }

  /**
   * The people a single role could resolve to.
   *
   * Each role answers a different question, and none of them is "pick an admin
   * and hope":
   *
   *   MEMBER              the person the document is about — always exactly one
   *   RESPONSIBLE         their `approve` routing, which is configured per
   *                       member and is deliberately not their notify list
   *   ORG_REPRESENTATIVE  somebody who may sign for the organization. Scoped to
   *                       the permission to issue documents rather than to
   *                       "admin", so it follows the same authority that puts a
   *                       document into somebody's file in the first place.
   *   CUSTOMER            clients of the spaces this member works in. The
   *                       document carries no space of its own, so the member is
   *                       what connects it to a client.
   */
  /**
   * Documents belonging to SOMEBODY ELSE that are waiting on this person now.
   *
   * Every other query on this screen is scoped to the caller's own personnel
   * file, which is right for a payslip and wrong for a countersignature: a
   * responsible signing a worker's time sheet is not the subject of it and so
   * never saw it. It arrived as a push notification about a document that
   * existed nowhere in the app.
   *
   * Authorisation is the signer row itself — being named as the signer of a
   * step is what entitles someone to that one document, and nothing else. Only
   * the CURRENT step qualifies: a document three people down the chain must not
   * appear on somebody's list before it is their turn, or the list stops
   * meaning "yours to do" and stops being read.
   *
   * Shared by the list and the badge so the two can never disagree about what
   * is outstanding.
   */
  async documentsWaitingOnMe(actor: DocumentActor) {
    const rows = await this.prisma.document.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: { not: actor.userId },
        status: 'AWAITING_SIGNATURE',
        /*
          Narrowed in SQL; whether it is their TURN is decided below, since
          "first pending step" is not expressible here and duplicating that rule
          in a query is how the two drift.

          Either named on the step or among the people it is open to — a step
          with three eligible leaders is genuinely waiting on all three, and
          matching only `userId` would hide it from everyone until somebody had
          already signed it.
        */
        signers: { some: { status: 'PENDING', eligibleUserIds: { has: actor.userId } } },
      },
      select: {
        id: true,
        title: true,
        typeId: true,
        periodYear: true,
        periodMonth: true,
        status: true,
        sizeBytes: true,
        mimeType: true,
        issuedAt: true,
        expiresOn: true,
        firstOpenedAt: true,
        user: { select: { firstName: true, lastName: true } },
        type: { select: { key: true, label: true, signatureMode: true, isCredential: true } },
        signers: {
          select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true },
        },
      },
      orderBy: { issuedAt: 'asc' },
      // A backstop, not pagination. Somebody with more than this waiting has a
      // process problem that a longer list would not solve.
      take: 200,
    });

    return rows.filter((d) => isCurrentSigner(d.signers as unknown as SignerStep[], actor.userId));
  }
}
